import { Component, createMemo, onMount, onCleanup, createSignal, createEffect } from 'solid-js';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  TimeScale,
  Filler,
  LineController,
  type ChartConfiguration
} from 'chart.js';
import { enUS } from 'date-fns/locale';
import 'chartjs-adapter-date-fns';
import type { Token, TokenHistory } from '../types';
import { debounce } from '../utils/debounce';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  TimeScale,
  Filler,
  LineController
);

// Constants for optimization
const MAX_DATA_POINTS = 200; // Reduced from 1000 for better performance
const MIN_DATA_POINT_DISTANCE = 60000; // 1 minute in milliseconds
const CHART_UPDATE_DEBOUNCE = 100; // Debounce chart updates

interface ChartProps {
  token: Token;
  history: TokenHistory[];
  type: 'liquidity' | 'holders';
  onTrendUpdate?: (direction: 'up' | 'down' | 'stagnant') => void;
}

export const TokenChart: Component<ChartProps> = (props) => {
  let chartContainer: HTMLDivElement | undefined;
  let chart: ChartJS | undefined;
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [isChartActive, setIsChartActive] = createSignal(false);

  // Memoize data processing
  const processedData = createMemo(() => {
    try {
      if (!props.history?.length) {
        setError('No history data available');
        return [];
      }

      // Sort data by timestamp first
      const sortedData = [...props.history].sort((a, b) => a.timestamp - b.timestamp);
      
      // Sample data points to reduce density
      const sampledData: TokenHistory[] = [];
      let lastTimestamp = 0;
      
      sortedData.forEach(point => {
        // Skip invalid points
        if (!point?.timestamp || (props.type === 'liquidity' ? point.totalLiquidity == null : point.holderCount == null)) {
          return;
        }

        // Only include points that are at least MIN_DATA_POINT_DISTANCE apart
        if (point.timestamp - lastTimestamp >= MIN_DATA_POINT_DISTANCE) {
          sampledData.push(point);
          lastTimestamp = point.timestamp;
        }
      });

      // Further reduce points if still too many
      let finalData = sampledData;
      if (sampledData.length > MAX_DATA_POINTS) {
        const step = Math.ceil(sampledData.length / MAX_DATA_POINTS);
        finalData = sampledData.filter((_, index) => index % step === 0);
      }

      // Map to chart format
      return finalData.map(point => ({
        x: Math.floor(point.timestamp / 1000), // Convert to seconds
        y: props.type === 'liquidity' ? point.totalLiquidity : point.holderCount
      }));

    } catch (err) {
      console.error('[Chart] Error processing data:', err);
      setError('Error processing data');
      return [];
    }
  });

  // Calculate trend data
  const trendInfo = createMemo(() => {
    const data = processedData();
    if (data.length < 2) return { trendDirection: 'stagnant' as const, trendData: [] };

    // Linear regression calculation
    const xValues = data.map((_, i) => i);
    const yValues = data.map(d => d.y);
    const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
    const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;
    
    const numerator = xValues.reduce((acc, x, i) => acc + (x - xMean) * (yValues[i] - yMean), 0);
    const denominator = xValues.reduce((acc, x) => acc + Math.pow(x - xMean, 2), 0);
    const slope = numerator / denominator;
    const intercept = yMean - slope * xMean;

    // Determine trend direction
    let trendDirection: 'up' | 'down' | 'stagnant' = 'stagnant';
    if (slope > 0.05) trendDirection = 'up';
    else if (slope < -0.05) trendDirection = 'down';

    // Generate trend line data
    const trendData = data.map((d, i) => ({
      x: d.x,
      y: slope * i + intercept
    }));

    return { trendDirection, trendData };
  });

  // Notify parent of trend updates
  createEffect(() => {
    props.onTrendUpdate?.(trendInfo().trendDirection);
  });

  const createOrUpdateChart = () => {
    try {
      if (!chartContainer) return;

      const canvas = chartContainer.querySelector('canvas');
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const data = processedData();
      if (!data.length) {
        setError('No data to display');
        setIsLoading(false);
        return;
      }

      // Destroy existing chart
      if (chart) {
        chart.destroy();
        setIsChartActive(false);
      }

      // Create new chart with optimized options
      const config: ChartConfiguration = {
        type: 'line',
        data: {
          datasets: [
            {
              label: props.type === 'liquidity' ? 'Liquidity ($)' : 'Holders',
              data: data,
              borderColor: props.type === 'liquidity' ? '#3182CE' : '#805AD5',
              backgroundColor: props.type === 'liquidity' ? '#3182CE33' : '#805AD533',
              fill: true,
              tension: 0.1,
              pointRadius: 0, // Hide points for better performance
              pointHoverRadius: 4,
              borderWidth: 2,
              spanGaps: true, // Connect points across gaps
            },
            {
              label: 'Trend Line',
              data: trendInfo().trendData,
              borderColor: trendInfo().trendDirection === 'up' ? '#22c55e' : 
                        trendInfo().trendDirection === 'down' ? '#ef4444' : '#64748b',
              borderWidth: 2,
              borderDash: [5, 5],
              pointRadius: 0,
              tension: 0,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false, // Disable animations for better performance
          interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
          },
          elements: {
            line: {
              tension: 0.1 // Reduce line tension for better performance
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              enabled: true,
              animation: false,
              position: 'nearest',
              callbacks: {
                label: (context) => {
                  const value = context.parsed.y;
                  return props.type === 'liquidity'
                    ? `$${value.toLocaleString()}`
                    : value.toLocaleString();
                }
              }
            }
          },
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'minute',
                displayFormats: {
                  minute: 'HH:mm',
                  hour: 'HH:mm'
                },
                tooltipFormat: 'MMM d, HH:mm'
              },
              adapters: {
                date: {
                  locale: enUS
                }
              },
              grid: {
                display: false
              },
              ticks: {
                maxTicksLimit: 8,
                color: '#718096',
                autoSkip: true
              }
            },
            y: {
              type: 'linear',
              beginAtZero: true,
              grid: {
                color: 'rgba(75,85,99,0.1)'
              },
              ticks: {
                maxTicksLimit: 6,
                color: '#718096',
                callback: (value) => {
                  if (props.type === 'liquidity') {
                    return `$${Number(value).toLocaleString()}`;
                  }
                  return value;
                }
              }
            }
          }
        }
      };

      chart = new ChartJS(ctx, config);
      setIsChartActive(true);
      setError(null);
      setIsLoading(false);
    } catch (err) {
      console.error('[Chart] Error creating chart:', err);
      setError('Error creating chart');
      setIsLoading(false);
    }
  };

  // Debounced chart update
  const debouncedChartUpdate = debounce(createOrUpdateChart, CHART_UPDATE_DEBOUNCE);

  // Handle resize
  const handleResize = debounce(() => {
    if (!chartContainer || !chart || !isChartActive()) return;
    
    try {
      const canvas = chartContainer.querySelector('canvas');
      if (!canvas) return;

      canvas.style.width = '100%';
      canvas.style.height = '100%';
      
      chart.resize();
    } catch (err) {
      console.error('[Chart] Error resizing chart:', err);
    }
  }, 250);

  onMount(() => {
    requestAnimationFrame(createOrUpdateChart);

    const observer = new ResizeObserver(() => {
      if (isChartActive()) {
        handleResize();
      }
    });

    if (chartContainer) {
      observer.observe(chartContainer);
    }

    onCleanup(() => {
      observer.disconnect();
      if (chart) {
        setIsChartActive(false);
        chart.destroy();
      }
    });
  });

  return (
    <div 
      ref={chartContainer}
      class="w-full h-[200px] bg-black/20 rd overflow-hidden relative"
    >
      <canvas style="position: absolute; left: 0; top: 0; width: 100%; height: 100%;" />
      {isLoading() && (
        <div class="absolute inset-0 flex items-center justify-center bg-black/20">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        </div>
      )}
      {error() && (
        <div class="absolute inset-0 flex items-center justify-center text-red-500 bg-black/20">
          {error()}
        </div>
      )}
    </div>
  );
};

// For backward compatibility
export const TokenLiquidityChart: Component<{ token: Token; history: TokenHistory[] }> = (props) => (
  <TokenChart token={props.token} history={props.history} type="liquidity" />
); 