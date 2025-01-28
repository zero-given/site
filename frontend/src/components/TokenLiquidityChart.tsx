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
  type ChartConfiguration,
  type Scale,
  type CoreScaleOptions,
  type Tick,
  type ScaleOptionsByType,
  type LinearScaleOptions
} from 'chart.js';
import { enUS } from 'date-fns/locale';
import 'chartjs-adapter-date-fns';
import type { Token, TokenHistory } from '../types';
import { debounce } from '../utils/debounce';
import { throttle } from '../utils/throttle';

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
const MIN_RANGE_PERCENT = 0.1; // Minimum range as percentage of max value
const PADDING_PERCENT = 0.2; // Padding around data as percentage of range
const UPDATE_THROTTLE = 300; // Milliseconds to throttle updates

interface ChartProps {
  token: Token;
  history: TokenHistory[];
  type: 'liquidity' | 'holders';
  onTrendUpdate?: (direction: 'up' | 'down' | 'stagnant') => void;
  dynamicScaling?: boolean;
}

export const TokenChart: Component<ChartProps> = (props) => {
  let chartContainer: HTMLDivElement | undefined;
  let chart: ChartJS | undefined;
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [isChartActive, setIsChartActive] = createSignal(false);
  const [scaleCache, setScaleCache] = createSignal<Map<string, { min: number; max: number }>>(new Map());

  // Memoize data processing
  const dataMemo = createMemo(() => {
    try {
      if (!props.history?.length) {
        setError('No history data available');
        return [];
      }

      // Sort and sample data
      const sortedData = [...props.history].sort((a, b) => a.timestamp - b.timestamp);
      const sampledData: TokenHistory[] = [];
      let lastTimestamp = 0;
      
      sortedData.forEach(point => {
        if (!point?.timestamp || (props.type === 'liquidity' ? point.totalLiquidity == null : point.holderCount == null)) {
          return;
        }

        if (point.timestamp - lastTimestamp >= MIN_DATA_POINT_DISTANCE) {
          sampledData.push(point);
          lastTimestamp = point.timestamp;
        }
      });

      // Further reduce if needed
      let finalData = sampledData;
      if (sampledData.length > MAX_DATA_POINTS) {
        const step = Math.ceil(sampledData.length / MAX_DATA_POINTS);
        finalData = sampledData.filter((_, index) => index % step === 0);
      }

      return finalData.map(point => ({
        x: Math.floor(point.timestamp / 1000),
        y: props.type === 'liquidity' ? point.totalLiquidity : point.holderCount
      }));
    } catch (err) {
      console.error('[Chart] Error processing data:', err);
      setError('Error processing data');
      return [];
    }
  });

  // Calculate trend data with better centering
  const trendInfo = createMemo(() => {
    const data = dataMemo();
    if (data.length < 2) return { trendDirection: 'stagnant' as const, trendData: [] };

    // Linear regression calculation
    const xValues = data.map((_, i) => i);
    const yValues = data.map(d => d.y);
    const xMean = xValues.reduce((a, b) => a + b, 0) / xValues.length;
    const yMean = yValues.reduce((a, b) => a + b, 0) / yValues.length;
    
    const numerator = xValues.reduce((acc, x, i) => acc + (x - xMean) * (yValues[i] - yMean), 0);
    const denominator = xValues.reduce((acc, x) => acc + Math.pow(x - xMean, 2), 0);
    const slope = numerator / denominator;

    // Calculate trend direction before any adjustments
    let trendDirection: 'up' | 'down' | 'stagnant' = 'stagnant';
    if (slope > 0.05) trendDirection = 'up';
    else if (slope < -0.05) trendDirection = 'down';

    // Calculate initial trend line
    let intercept = yMean - (slope * xMean);
    const initialTrendPoints = xValues.map(x => slope * x + intercept);

    // Calculate data and trend ranges
    const dataMin = Math.min(...yValues);
    const dataMax = Math.max(...yValues);
    const dataMidpoint = (dataMax + dataMin) / 2;
    
    const trendMin = Math.min(...initialTrendPoints);
    const trendMax = Math.max(...initialTrendPoints);
    const trendMidpoint = (trendMax + trendMin) / 2;

    // Center the trend line by adjusting intercept
    const verticalShift = dataMidpoint - trendMidpoint;
    intercept += verticalShift;

    // Generate final trend line data
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

  // Improved dynamic bounds calculation
  const getDynamicBounds = (data: { x: number; y: number }[], trendData: { x: number; y: number }[]) => {
    if (!data.length || !trendData.length) return { min: 0, max: 0 };

    const values = data.map(d => d.y);
    const trendValues = trendData.map(d => d.y);
    
    // Calculate ranges
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const trendMin = Math.min(...trendValues);
    const trendMax = Math.max(...trendValues);

    // Find the overall range including both data and trend
    const absoluteMin = Math.min(dataMin, trendMin);
    const absoluteMax = Math.max(dataMax, trendMax);
    const range = absoluteMax - absoluteMin;

    // Calculate the midpoint of the entire range
    const midpoint = (absoluteMax + absoluteMin) / 2;

    // Ensure minimum range and add padding
    const minRange = Math.max(
      range,
      absoluteMax * MIN_RANGE_PERCENT,
      Math.abs(midpoint) * 0.2 // Minimum 20% of midpoint value
    );
    
    // Add padding proportional to the range
    const paddedRange = minRange * (1 + PADDING_PERCENT * 2);
    const halfRange = paddedRange / 2;

    return {
      min: midpoint - halfRange,
      max: midpoint + halfRange
    };
  };

  // Add separate effects for dynamic scaling and data updates
  createEffect(() => {
    const isDynamicScaling = props.dynamicScaling;
    const data = dataMemo();
    const { trendData } = trendInfo();
    const currentChart = chart;
    
    if (currentChart && isChartActive()) {
      // Calculate new bounds based on scaling mode
      const bounds = isDynamicScaling ? 
        getDynamicBounds(data, trendData) : 
        { min: 0, max: undefined };

      // Update chart configuration
      currentChart.options.scales!.y = {
        ...currentChart.options.scales!.y,
        min: bounds.min,
        max: bounds.max,
        grace: isDynamicScaling ? '10%' : undefined
      };

      // Force full update and resize
      currentChart.update();
      currentChart.resize();
      
      // Add debug logging
      console.debug('[Chart] Dynamic scaling updated', { 
        isDynamicScaling,
        bounds,
        dataLength: data.length
      });
    }
  });

  // Modify throttled update to be more responsive
  const throttledUpdate = throttle(() => {
    const currentChart = chart;
    if (!currentChart || !isChartActive()) return;

    const data = dataMemo();
    const { trendDirection, trendData } = trendInfo();
    const bounds = props.dynamicScaling ? 
      getDynamicBounds(data, trendData) : 
      { min: 0, max: undefined };

    // Update data first
    currentChart.data.datasets![0].data = data;
    currentChart.data.datasets![1].data = trendData;

    // Then update scales
    currentChart.options.scales!.y = {
      ...currentChart.options.scales!.y,
      min: bounds.min,
      max: bounds.max,
      grace: props.dynamicScaling ? '10%' : undefined
    };

    // Force complete update cycle
    currentChart.resize();
    currentChart.update();
    currentChart.draw();
  }, 50); // Keep throttle time short for responsiveness

  // Modify chart creation for faster initial render
  const createOrUpdateChart = () => {
    try {
      if (!chartContainer) return;
      const canvas = chartContainer.querySelector('canvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const data = dataMemo();
      if (!data.length) {
        setError('No data to display');
        setIsLoading(false);
        return;
      }

      // Calculate initial configuration
      const { trendDirection, trendData } = trendInfo();
      const bounds = props.dynamicScaling ? 
        getDynamicBounds(data, trendData) : 
        { min: 0, max: undefined };

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
              pointRadius: 0,
              pointHoverRadius: 4,
              borderWidth: 2,
              spanGaps: true,
            },
            {
              label: 'Trend Line',
              data: trendData,
              borderColor: trendDirection === 'up' ? '#22c55e' : 
                        trendDirection === 'down' ? '#ef4444' : '#64748b',
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
          animation: {
            duration: 0 // Disable animations for immediate updates
          },
          transitions: {
            active: {
              animation: {
                duration: 0
              }
            }
          },
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
              type: 'time' as const,
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
              min: bounds.min,
              max: bounds.max,
              grace: props.dynamicScaling ? '10%' : undefined,
              grid: {
                color: 'rgba(75,85,99,0.1)'
              },
              ticks: {
                maxTicksLimit: 6,
                color: '#718096',
                callback: function(value) {
                  const num = Number(value);
                  return props.type === 'liquidity' 
                    ? `$${num.toLocaleString()}`
                    : num.toLocaleString();
                }
              }
            }
          }
        }
      };

      chart = new ChartJS(ctx, config);
      setIsChartActive(true);
      
      // Force immediate initial render
      requestAnimationFrame(() => {
        if (chart) {
          chart.update('none');
        }
      });
    } catch (err) {
      console.error('[Chart] Error creating chart:', err);
      setError('Error creating chart');
    } finally {
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
      const currentChart = chart;
      if (currentChart && isChartActive()) {
        requestAnimationFrame(() => {
          currentChart.resize();
          currentChart.update();
          currentChart.draw();
        });
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
      throttledUpdate.cancel();
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
      
      {/* Add debug overlay in development */}
      {import.meta.env.DEV && (
        <div class="absolute top-1 right-1 text-xs text-white/50 pointer-events-none">
          <div>Dynamic: {props.dynamicScaling ? 'On' : 'Off'}</div>
          <div>Active: {isChartActive() ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  );
};

// For backward compatibility
export const TokenLiquidityChart: Component<{ token: Token; history: TokenHistory[] }> = (props) => (
  <TokenChart token={props.token} history={props.history} type="liquidity" />
); 