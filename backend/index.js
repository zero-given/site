const express = require('express');
const db = require('./db');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const util = require('util');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  server,
  verifyClient: (info, cb) => {
    // Allow connections from any origin
    cb(true);
  }
});

const PORT = 3002;
const HOST = '0.0.0.0'; // Listen on all network interfaces
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CLIENT_TIMEOUT = 35000; // 35 seconds

// Track connected clients with their last heartbeat time
const clients = new Map();

function heartbeat() {
  this.isAlive = true;
  this.lastHeartbeat = Date.now();
}

function noop() {}

// Heartbeat interval to check client connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) {
      clients.delete(ws);
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping(noop);
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('\n=== New WebSocket Connection ===');
  connectedClients++;
  console.log('Active connections:', wss.clients.size);
  
  ws.isAlive = true;
  ws.lastHeartbeat = Date.now();
  clients.set(ws, { connectedAt: Date.now() });
  
  // Set up ping-pong
  ws.on('pong', heartbeat);
  
  // Send initial connection confirmation
  console.log('Sending connection confirmation...');
  ws.send(JSON.stringify({ 
    type: 'CONNECTED',
    timestamp: Date.now()
  }));
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      console.log('\nReceived WebSocket message:', data);
      
      switch (data.type) {
        case 'PING':
          console.log('Received PING, sending PONG...');
          ws.send(JSON.stringify({ 
            type: 'PONG',
            timestamp: Date.now()
          }));
          break;
          
        case 'REQUEST_INITIAL_TOKENS':
          console.log('Received request for initial tokens');
          try {
            // Get the last 50 tokens from the database
            const tokens = await db.all(`
              SELECT * FROM scan_records 
              ORDER BY scan_timestamp DESC 
              LIMIT 50
            `);
            
            console.log(`Sending ${tokens.length} initial tokens to client`);
            
            // Send each token individually to maintain consistency
            for (const token of tokens) {
              ws.send(JSON.stringify({
                type: 'NEW_TOKEN',
                token: token,
                timestamp: Date.now()
              }));
            }
          } catch (err) {
            console.error('Error fetching initial tokens:', err);
          }
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
      
      console.log('Message processed successfully');
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });
  
  ws.on('close', () => {
    console.log('\n=== WebSocket Connection Closed ===');
    connectedClients--;
    console.log('Remaining connections:', wss.clients.size - 1);
    clients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error('\n=== WebSocket Error ===');
    console.error(error);
    connectedClients--;
    clients.delete(ws);
  });
});

// Helper function to broadcast to all connected clients
function broadcastToAll(data) {
  console.log('\n=== Broadcasting to All Clients ===');
  console.log('Number of clients:', wss.clients.size);
  console.log('Message type:', data.type);
  
  const message = JSON.stringify(data);
  let successCount = 0;
  let errorCount = 0;
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
        successCount++;
      } catch (err) {
        console.error('Error broadcasting to client:', err);
        errorCount++;
        client.terminate();
      }
    }
  });
  
  console.log(`Broadcast complete - Success: ${successCount}, Errors: ${errorCount}`);
}

// Clean up dead connections periodically
setInterval(() => {
  const now = Date.now();
  clients.forEach((value, ws) => {
    if (now - ws.lastHeartbeat > CLIENT_TIMEOUT) {
      console.log('Client timed out, terminating connection');
      clients.delete(ws);
      ws.terminate();
    }
  });
}, HEARTBEAT_INTERVAL);

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

// Track connected clients
let connectedClients = 0;

// Keep track of the last token we've seen
let lastKnownToken = null;
let checkCounter = 0;
let countdownValue = 10;

// Function to show countdown
function showCountdown(seconds) {
  const spinChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const spinIdx = checkCounter % spinChars.length;
  const spinner = spinChars[spinIdx];
  process.stdout.write(`\r${colors.cyan}${spinner} Next DB check in ${seconds}s${colors.reset}`);
}

// Function to check for new tokens
async function checkForNewTokens() {
  try {
    checkCounter++;
    console.log('\n'); // Clear line before status
    updateStatus('Checking for new tokens...', 'blue');
    const latestToken = await db.get(`
      SELECT * FROM scan_records 
      ORDER BY scan_timestamp DESC 
      LIMIT 1
    `);

    if (!latestToken) {
      updateStatus('No tokens found', 'yellow');
      return;
    }

    // If this is our first check, just store the token
    if (!lastKnownToken) {
      lastKnownToken = latestToken;
      updateStatus('Initial token recorded', 'green');
      return;
    }

    // Check if we have a new token by comparing timestamps
    if (latestToken.scan_timestamp !== lastKnownToken.scan_timestamp) {
      console.log('\n' + '='.repeat(50));
      console.log(`${colors.bright}${colors.green}🔔 TOKEN DETECTED SENDING NOTIFICATION TO FRONT END${colors.reset}`);
      console.log('='.repeat(50));
      console.log(`${colors.cyan}Token Address:${colors.reset} ${latestToken.token_address}`);
      console.log(`${colors.cyan}Token Name:${colors.reset}   ${latestToken.token_name}`);
      console.log(`${colors.cyan}Timestamp:${colors.reset}    ${latestToken.scan_timestamp}`);
      console.log('='.repeat(50));
      console.log(`${colors.bright}${colors.yellow}📡 BROADCASTING TO FRONTEND...${colors.reset}`);
      console.log('='.repeat(50) + '\n');

      // Broadcast the new token
      broadcastToAll({
        type: 'NEW_TOKEN',
        token: latestToken
      });

      // Update our last known token
      lastKnownToken = latestToken;
    } else {
      updateStatus('No new tokens', 'yellow');
    }
  } catch (err) {
    console.error('Error checking for new tokens:', err);
    updateStatus('Error checking tokens', 'red');
  }
}

// Start countdown timer
const countdownInterval = setInterval(() => {
  countdownValue = (countdownValue - 1 + 10) % 10;
  showCountdown(countdownValue);
}, 1000);

// Start periodic token checking
const CHECK_INTERVAL = 10000; // 10 seconds
const tokenCheckInterval = setInterval(checkForNewTokens, CHECK_INTERVAL);

// Run initial check
checkForNewTokens();

// Update status display
function updateStatus(status, color = 'yellow') {
  const timestamp = new Date().toLocaleTimeString();
  const clientText = `${connectedClients} client${connectedClients !== 1 ? 's' : ''} connected`;
  console.log(`${colors[color]}[${timestamp}] WebSocket: ${status} (${clientText})${colors.reset}`);
}

// Initial status
updateStatus('Starting server...', 'yellow');

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow any localhost connection or no origin (like direct HTTP requests)
    if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('https://localhost:')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Broadcast new token to all connected clients
function broadcastNewToken(token) {
  updateStatus('Broadcasting new token...', 'cyan');
  console.log('Broadcasting new token:', token);
  broadcastToAll({
    type: 'NEW_TOKEN',
    token: {
      // Basic token info
      address: token.token_address,
      name: token.token_name || `Token ${token.token_address?.slice(0, 6)}`,
      symbol: token.token_symbol || 'TOKEN',
      decimals: token.token_decimals,
      totalSupply: token.token_total_supply,
      ageHours: token.token_age_hours,
      
      // Pair info
      pairAddress: token.pair_address,
      reservesToken0: token.hp_pair_reserves0,
      reservesToken1: token.hp_pair_reserves1,
      creationTx: token.hp_creation_tx,
      creationTime: token.hp_creation_time,
      
      // Honeypot analysis
      isHoneypot: token.hp_is_honeypot === 1,
      honeypotReason: token.hp_honeypot_reason,
      riskLevel: token.hp_risk_level,
      riskType: token.hp_risk_type,
      
      // Contract info
      isOpenSource: token.hp_is_open_source === 1,
      isProxy: token.hp_is_proxy === 1,
      isMintable: token.hp_is_mintable === 1,
      canBeMinted: token.hp_can_be_minted === 1,
      hasProxyCalls: token.hp_has_proxy_calls === 1,
      
      // Tax and gas info
      buyTax: token.hp_buy_tax,
      sellTax: token.hp_sell_tax,
      transferTax: token.hp_transfer_tax,
      buyGas: token.hp_buy_gas_used,
      sellGas: token.hp_sell_gas_used,
      
      // Ownership info
      ownerAddress: token.hp_owner_address,
      creatorAddress: token.hp_creator_address,
      deployerAddress: token.hp_deployer_address,
      
      // GoPlus security info
      gpIsOpenSource: token.gp_is_open_source === 1,
      gpIsProxy: token.gp_is_proxy === 1,
      gpIsMintable: token.gp_is_mintable === 1,
      gpOwnerAddress: token.gp_owner_address,
      gpCreatorAddress: token.gp_creator_address,
      gpCanTakeBackOwnership: token.gp_can_take_back_ownership === 1,
      gpOwnerChangeBalance: token.gp_owner_change_balance === 1,
      gpHiddenOwner: token.gp_hidden_owner === 1,
      gpSelfDestruct: token.gp_selfdestruct === 1,
      gpExternalCall: token.gp_external_call === 1,
      gpBuyTax: token.gp_buy_tax,
      gpSellTax: token.gp_sell_tax,
      gpIsAntiWhale: token.gp_is_anti_whale === 1,
      gpAntiWhaleModifiable: token.gp_anti_whale_modifiable === 1,
      gpCannotBuy: token.gp_cannot_buy === 1,
      gpCannotSellAll: token.gp_cannot_sell_all === 1,
      gpSlippageModifiable: token.gp_slippage_modifiable === 1,
      gpPersonalSlippageModifiable: token.gp_personal_slippage_modifiable === 1,
      gpTradingCooldown: token.gp_trading_cooldown === 1,
      gpIsBlacklisted: token.gp_is_blacklisted === 1,
      gpIsWhitelisted: token.gp_is_whitelisted === 1,
      gpIsInDex: token.gp_is_in_dex === 1,
      gpTransferPausable: token.gp_transfer_pausable === 1,
      gpCanBeMinted: token.gp_can_be_minted === 1,
      gpTotalSupply: token.gp_total_supply,
      gpHolderCount: token.gp_holder_count,
      gpOwnerPercent: token.gp_owner_percent,
      gpOwnerBalance: token.gp_owner_balance,
      gpCreatorPercent: token.gp_creator_percent,
      gpCreatorBalance: token.gp_creator_balance,
      gpLpHolderCount: token.gp_lp_holder_count,
      gpLpTotalSupply: token.gp_lp_total_supply,
      gpIsTrueToken: token.gp_is_true_token === 1,
      gpIsAirdropScam: token.gp_is_airdrop_scam === 1,
      gpHoneypotWithSameCreator: token.gp_honeypot_with_same_creator === 1,
      gpFakeToken: token.gp_fake_token === 1,
      
      // Parse JSON fields
      gpHolders: tryParseJSON(token.gp_holders, []),
      gpLpHolders: tryParseJSON(token.gp_lp_holders, []),
      gpDexInfo: tryParseJSON(token.gp_dex_info, []),
      
      // Additional metadata
      totalScans: token.total_scans,
      honeypotFailures: token.honeypot_failures,
      lastError: token.last_error,
      status: token.status,
      
      // Liquidity history
      liq10: token.liq10,
      liq20: token.liq20,
      liq30: token.liq30,
      liq40: token.liq40,
      liq50: token.liq50,
      liq60: token.liq60,
      liq70: token.liq70,
      liq80: token.liq80,
      liq90: token.liq90,
      liq100: token.liq100,
      liq110: token.liq110,
      liq120: token.liq120,
      liq130: token.liq130,
      liq140: token.liq140,
      liq150: token.liq150,
      liq160: token.liq160,
      liq170: token.liq170,
      liq180: token.liq180,
      liq190: token.liq190,
      liq200: token.liq200,
      
      // Scan info
      scanTimestamp: token.scan_timestamp
    }
  });
}

// Helper function to safely parse JSON
function tryParseJSON(str, defaultValue = null) {
  try {
    return str ? JSON.parse(str) : defaultValue;
  } catch (e) {
    console.error('Error parsing JSON:', e);
    return defaultValue;
  }
}

// Test endpoint to simulate new token
app.post('/api/test/new-token', async (req, res) => {
  try {
    console.log('\n=== Testing New Token Broadcast ===');
    
    // Get the most recent token from scan_records
    const token = await db.get(`
      SELECT * FROM scan_records 
      ORDER BY scan_timestamp DESC 
      LIMIT 1
    `);

    if (token) {
      console.log('Broadcasting token:', {
        address: token.token_address,
        name: token.token_name,
        timestamp: token.scan_timestamp
      });
      broadcastNewToken(token);
      res.json({ message: 'Test token broadcast sent' });
    } else {
      console.log('No tokens found in scan_records');
      res.status(404).json({ error: 'No tokens found to broadcast' });
    }
  } catch (err) {
    console.error('Error in test endpoint:', err);
    res.status(500).json({ error: 'Failed to broadcast test token' });
  }
});

// API Endpoints

// Get all tokens
app.get('/api/tokens', async (req, res) => {
  try {
    console.log('\n--- /api/tokens endpoint hit ---');
    
    // Debug database connection
    if (!db) {
      console.error('Database connection is not initialized');
      throw new Error('Database connection not available');
    }
    
    console.log('Querying database at:', db?.config?.connection?.filename || 'unknown location');
    
    const tokens = await db.all(`
      SELECT *
      FROM scan_records
      ORDER BY scan_timestamp DESC
    `);
    
    console.log(`Found ${tokens.length} token records`);
    
    // Debug: Print full raw token data
    console.log('\nFull raw token records:');
    console.log(JSON.stringify(tokens, null, 2));
    
    // Also print first token with all fields
    if (tokens.length > 0) {
      console.log('\nFirst token record with all fields:');
      Object.entries(tokens[0]).forEach(([key, value]) => {
        console.log(`${key}: ${value}`);
      });
    } else {
      console.log('No token records found in database');
    }

    const formattedTokens = tokens.map(token => {
      try {
        // Parse JSON data with better error handling
        let tokenData = {};
        let honeypotData = {};
        let goplusData = {};
        
        try {
          tokenData = JSON.parse(token.token_data || '{}');
        } catch (e) {
          console.error(`Error parsing token_data for ${token.token_address}:`, e);
        }
        
        try {
          honeypotData = JSON.parse(token.honeypot_data || '{}');
        } catch (e) {
          console.error(`Error parsing honeypot_data for ${token.token_address}:`, e);
        }
        
        try {
          goplusData = JSON.parse(token.goplus_data || '{}');
        } catch (e) {
          console.error(`Error parsing goplus_data for ${token.token_address}:`, e);
        }

        // Extract and normalize all data fields
        const hpSimulation = honeypotData.simulation || {};
        const hpPair = honeypotData.pair || {};
        const hpContract = honeypotData.contract || {};
        const gpSecurity = goplusData.security || {};
        const gpTaxes = goplusData.taxes || {};
        const gpHolders = goplusData.holders || {};
        const gpDex = goplusData.dex || {};
        const gpLiquidity = goplusData.liquidity || {};
        const gpOwnership = goplusData.ownership || {};

        // Create complete token object preserving original values
        const tokenObject = {
          // Basic token info
          address: token.token_address,
          name: token.token_name || `Token ${token.token_address?.slice(0, 6)}`,
          symbol: token.token_symbol || 'TOKEN',
          decimals: token.token_decimals,
          totalSupply: token.token_total_supply,
          ageHours: token.token_age_hours,
          
          // Pair info
          pairAddress: token.pair_address,
          reservesToken0: token.hp_pair_reserves0,
          reservesToken1: token.hp_pair_reserves1,
          creationTx: token.hp_creation_tx,
          creationTime: token.hp_creation_time,
          
          // Honeypot analysis
          isHoneypot: token.hp_is_honeypot === 1,
          honeypotReason: token.hp_honeypot_reason,
          riskLevel: token.hp_risk_level,
          riskType: token.hp_risk_type,
          
          // Contract info
          isOpenSource: token.hp_is_open_source === 1,
          isProxy: token.hp_is_proxy === 1,
          isMintable: token.hp_is_mintable === 1,
          canBeMinted: token.hp_can_be_minted === 1,
          hasProxyCalls: token.hp_has_proxy_calls === 1,
          
          // Tax and gas info
          buyTax: token.hp_buy_tax,
          sellTax: token.hp_sell_tax,
          transferTax: token.hp_transfer_tax,
          buyGas: token.hp_buy_gas_used,
          sellGas: token.hp_sell_gas_used,
          
          // Ownership info
          ownerAddress: token.hp_owner_address,
          creatorAddress: token.hp_creator_address,
          deployerAddress: token.hp_deployer_address,
          
          // GoPlus security info
          gpIsOpenSource: token.gp_is_open_source === 1,
          gpIsProxy: token.gp_is_proxy === 1,
          gpIsMintable: token.gp_is_mintable === 1,
          gpOwnerAddress: token.gp_owner_address,
          gpCreatorAddress: token.gp_creator_address,
          gpCanTakeBackOwnership: token.gp_can_take_back_ownership === 1,
          gpOwnerChangeBalance: token.gp_owner_change_balance === 1,
          gpHiddenOwner: token.gp_hidden_owner === 1,
          gpSelfDestruct: token.gp_selfdestruct === 1,
          gpExternalCall: token.gp_external_call === 1,
          gpBuyTax: token.gp_buy_tax,
          gpSellTax: token.gp_sell_tax,
          gpIsAntiWhale: token.gp_is_anti_whale === 1,
          gpAntiWhaleModifiable: token.gp_anti_whale_modifiable === 1,
          gpCannotBuy: token.gp_cannot_buy === 1,
          gpCannotSellAll: token.gp_cannot_sell_all === 1,
          gpSlippageModifiable: token.gp_slippage_modifiable === 1,
          gpPersonalSlippageModifiable: token.gp_personal_slippage_modifiable === 1,
          gpTradingCooldown: token.gp_trading_cooldown === 1,
          gpIsBlacklisted: token.gp_is_blacklisted === 1,
          gpIsWhitelisted: token.gp_is_whitelisted === 1,
          gpIsInDex: token.gp_is_in_dex === 1,
          gpTransferPausable: token.gp_transfer_pausable === 1,
          gpCanBeMinted: token.gp_can_be_minted === 1,
          gpTotalSupply: token.gp_total_supply,
          gpHolderCount: token.gp_holder_count,
          gpOwnerPercent: token.gp_owner_percent,
          gpOwnerBalance: token.gp_owner_balance,
          gpCreatorPercent: token.gp_creator_percent,
          gpCreatorBalance: token.gp_creator_balance,
          gpLpHolderCount: token.gp_lp_holder_count,
          gpLpTotalSupply: token.gp_lp_total_supply,
          gpIsTrueToken: token.gp_is_true_token === 1,
          gpIsAirdropScam: token.gp_is_airdrop_scam === 1,
          gpHoneypotWithSameCreator: token.gp_honeypot_with_same_creator === 1,
          gpFakeToken: token.gp_fake_token === 1,
          
          // Holders and LP info
          gpHolders: JSON.parse(token.gp_holders || '[]'),
          gpLpHolders: JSON.parse(token.gp_lp_holders || '[]'),
          
          // DEX info
          gpDexInfo: JSON.parse(token.gp_dex_info || '[]'),
          
          // Additional metadata
          totalScans: token.total_scans,
          honeypotFailures: token.honeypot_failures,
          lastError: token.last_error,
          status: token.status,
          
          // Liquidity history
          liq10: token.liq10,
          liq20: token.liq20,
          liq30: token.liq30,
          liq40: token.liq40,
          liq50: token.liq50,
          liq60: token.liq60,
          liq70: token.liq70,
          liq80: token.liq80,
          liq90: token.liq90,
          liq100: token.liq100,
          liq110: token.liq110,
          liq120: token.liq120,
          liq130: token.liq130,
          liq140: token.liq140,
          liq150: token.liq150,
          liq160: token.liq160,
          liq170: token.liq170,
          liq180: token.liq180,
          liq190: token.liq190,
          liq200: token.liq200,
          
          // Scan info
          scanTimestamp: token.scan_timestamp
        };

        return tokenObject;
      } catch (error) {
        console.error('Error parsing token data:', error);
        return null;
      }
    }).filter(Boolean);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ tokens: formattedTokens }, null, 2));
  } catch (err) {
    console.error('Error fetching tokens:', err);
    res.status(500).json({ error: 'Failed to fetch tokens' });
  }
});

// Get token details
app.get('/api/tokens/:address', async (req, res) => {
  const { address } = req.params;
  try {
    const token = await db.get(`
      SELECT * FROM scan_records
      WHERE token_address = ?
    `, [address]);
    
    if (token) {
      res.json(token);
    } else {
      res.status(404).json({ error: 'Token not found' });
    }
  } catch (err) {
    console.error('Error fetching token:', err);
    res.status(500).json({ error: 'Failed to fetch token' });
  }
});

// Debug endpoint to show raw database records
app.get('/api/debug/records', async (req, res) => {
  try {
    const records = await db.all('SELECT * FROM scan_records');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(records, null, 2));
  } catch (err) {
    console.error('Error fetching debug records:', err);
    res.status(500).json({ error: 'Failed to fetch debug records' });
  }
});

// Get token history
app.get('/api/tokens/:address/history', async (req, res) => {
  const address = req.params.address;
  console.log('\n=== Token History Request ===');
  console.log('Token address:', address);

  try {
    // Find token in scan_records
    const token = await db.get(
      'SELECT token_name, token_address FROM scan_records WHERE LOWER(token_address) = LOWER(?)',
      [address]
    );
    console.log('Token found in scan_records:', token);

    if (!token) {
      return res.status(404).json({ error: 'Token not found' });
    }

    // Find matching history table
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?",
      [`%${address.toLowerCase()}%`]
    );
    console.log('Found tables with matching address:', tables);

    if (tables.length === 0) {
      return res.status(404).json({ error: 'No history table found for token' });
    }

    const historyTable = tables[0].name;
    console.log('Using history table:', historyTable);

    // First get table info to see what columns exist
    const tableInfo = await db.all(`PRAGMA table_info("${historyTable}")`);
    console.log('Table structure:', tableInfo);

    // Build query based on available columns
    const hasHPLiquidity = tableInfo.some(col => col.name === 'hp_liquidity_amount');
    const hasGPLiquidity = tableInfo.some(col => col.name === 'gp_dex_info');
    const hasTimestamp = tableInfo.some(col => col.name === 'scan_timestamp');
    const hasHolderCount = tableInfo.some(col => col.name === 'gp_holder_count');
    const hasLpHolderCount = tableInfo.some(col => col.name === 'gp_lp_holder_count');

    if (!hasTimestamp) {
      throw new Error('Table is missing required timestamp column');
    }

    let selectClauses = ['scan_timestamp'];
    if (hasHPLiquidity) selectClauses.push('hp_liquidity_amount');
    if (hasGPLiquidity) selectClauses.push('gp_dex_info');
    if (hasHolderCount) selectClauses.push('gp_holder_count');
    if (hasLpHolderCount) selectClauses.push('gp_lp_holder_count');

    // Query history data
    const query = `
      SELECT ${selectClauses.join(', ')}
      FROM "${historyTable}"
      ORDER BY scan_timestamp ASC
    `;
    console.log('Executing query:', query);

    const history = await db.all(query);
    console.log('Raw history data:', history);
    
    if (!history || history.length === 0) {
      return res.status(404).json({ error: 'No liquidity history available' });
    }

    // Transform data for chart
    const chartData = history.map(record => {
      const timestamp = new Date(record.scan_timestamp).getTime(); // Convert to Unix timestamp in ms
      let hpLiquidity = 0;
      let gpLiquidity = 0;
      let holderCount = record.gp_holder_count || 0;
      let lpHolderCount = record.gp_lp_holder_count || 0;

      if (record.hp_liquidity_amount) {
        hpLiquidity = parseFloat(record.hp_liquidity_amount);
      }

      if (record.gp_dex_info) {
        try {
          const dexInfo = JSON.parse(record.gp_dex_info);
          if (Array.isArray(dexInfo) && dexInfo[0] && dexInfo[0].liquidity) {
            gpLiquidity = parseFloat(dexInfo[0].liquidity);
          }
        } catch (e) {
          console.error('Error parsing gp_dex_info:', e);
        }
      }

      return {
        timestamp,
        hpLiquidity,
        gpLiquidity,
        totalLiquidity: hpLiquidity + gpLiquidity,
        holderCount,
        lpHolderCount
      };
    }).filter(point => !isNaN(point.hpLiquidity) || !isNaN(point.gpLiquidity));

    console.log('Transformed chart data:', chartData);

    // Add debug info to the response
    const debugInfo = {
      tableName: historyTable,
      recordCount: history.length,
      highestLiquidity: Math.max(...chartData.map(d => d.totalLiquidity)),
      lowestLiquidity: Math.min(...chartData.map(d => d.totalLiquidity)),
      timeRange: {
        start: new Date(Math.min(...chartData.map(d => d.timestamp))).toLocaleString(),
        end: new Date(Math.max(...chartData.map(d => d.timestamp))).toLocaleString()
      }
    };

    console.log('\n=== Chart Debug Info ===');
    console.log('Table name:', debugInfo.tableName);
    console.log('Number of records:', debugInfo.recordCount);
    console.log('Highest liquidity:', debugInfo.highestLiquidity);
    console.log('Lowest liquidity:', debugInfo.lowestLiquidity);
    console.log('Time range:', debugInfo.timeRange);
    console.log('First 3 records:', chartData.slice(0, 3));
    console.log('Last 3 records:', chartData.slice(-3));

    res.json({ 
      history: chartData,
      debug: debugInfo
    });

  } catch (err) {
    console.error('Error fetching token history:', err);
    res.status(500).json({ error: 'Failed to fetch token history' });
  }
});

// Add this before starting the server
async function printLatestRecord() {
  try {
    // Get the most recent record
    const latestRecord = await db.get(`
      SELECT * FROM scan_records 
      ORDER BY scan_timestamp DESC 
      LIMIT 1
    `);

    if (!latestRecord) {
      console.log('No records found in database');
      return;
    }

    console.log('\n=== Complete Database Record ===\n');
    
    // Print every single field from the record
    console.log('Raw Database Fields:');
    console.log('━'.repeat(100));
    
    // Get all column names
    const columns = Object.keys(latestRecord);
    
    // Calculate the longest column name for alignment
    const maxLength = Math.max(...columns.map(col => col.length));
    
    // Print each field with its value
    columns.forEach(column => {
      const value = latestRecord[column];
      const paddedColumn = column.padEnd(maxLength);
      
      // Try to parse JSON if the value looks like JSON
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          const jsonValue = JSON.parse(value);
          console.log(`${paddedColumn}: ${util.inspect(jsonValue, { depth: null, colors: true })}`);
        } catch {
          console.log(`${paddedColumn}: ${value}`);
        }
      } else {
        console.log(`${paddedColumn}: ${value}`);
      }
    });

    // Print formatted sections as before
    console.log('\n=== Formatted Analysis ===\n');
    
    // Token Info Section
    console.log('Token Info:');
    console.log('━'.repeat(100));
    console.log(`Token Address:    ${latestRecord.token_address}`);
    console.log(`Pair Address:     ${latestRecord.pair_address}`);
    console.log(`Token Name:       ${latestRecord.token_name}`);
    console.log(`Token Symbol:     ${latestRecord.token_symbol}`);
    console.log(`Decimals:         ${latestRecord.token_decimals}`);
    console.log(`Total Supply:     ${latestRecord.token_total_supply}`);
    console.log(`Total Holders:    ${latestRecord.hp_holder_count}`);
    console.log(`Age (hours):      ${latestRecord.token_age_hours}`);
    
    // Pair Info Section
    console.log('\nPair Info:');
    console.log('━'.repeat(100));
    console.log(`Liquidity:        $${latestRecord.hp_liquidity_amount}`);
    console.log(`Creation Time:    ${latestRecord.hp_creation_time}`);
    console.log(`Reserves Token0:  ${latestRecord.hp_pair_reserves0}`);
    console.log(`Reserves Token1:  ${latestRecord.hp_pair_reserves1}`);
    console.log(`Creation Tx:      ${latestRecord.hp_creation_tx || 'N/A'}`);
    
    // Simulation Section
    console.log('\nSimulation:');
    console.log('━'.repeat(100));
    console.log(`Success:          ${latestRecord.hp_simulation_success ? 'Yes' : 'No'}`);
    console.log(`Buy Tax:          ${latestRecord.hp_buy_tax}%`);
    console.log(`Sell Tax:         ${latestRecord.hp_sell_tax}%`);
    console.log(`Transfer Tax:     ${latestRecord.hp_transfer_tax}%`);
    console.log(`Buy Gas:          ${latestRecord.hp_buy_gas_used}`);
    console.log(`Sell Gas:         ${latestRecord.hp_sell_gas_used}`);
    
    // Contract Section
    console.log('\nContract:');
    console.log('━'.repeat(100));
    console.log(`Open Source:      ${latestRecord.hp_is_open_source ? 'Yes' : 'No'}`);
    console.log(`Is Proxy:         ${latestRecord.hp_is_proxy ? 'Yes' : 'No'}`);
    console.log(`Has Proxy Calls:  ${latestRecord.hp_has_proxy_calls ? 'Yes' : 'No'}`);
    console.log(`Is Mintable:      ${latestRecord.hp_is_mintable ? 'Yes' : 'No'}`);
    console.log(`Can Be Minted:    ${latestRecord.hp_can_be_minted ? 'Yes' : 'No'}`);
    
    // Honeypot Analysis Section
    console.log('\nHoneypot Analysis:');
    console.log('━'.repeat(100));
    console.log(`Is Honeypot:      ${latestRecord.hp_is_honeypot ? 'Yes' : 'No'}`);
    if (latestRecord.hp_honeypot_reason) {
      console.log(`Honeypot Reason:  ${latestRecord.hp_honeypot_reason}`);
    }
    console.log(`Risk Level:       ${latestRecord.hp_risk_level || 'N/A'}`);
    console.log(`Risk Type:        ${latestRecord.hp_risk_type || 'N/A'}`);
    
    // Ownership Section
    console.log('\nOwnership Info:');
    console.log('━'.repeat(100));
    console.log(`Owner Address:    ${latestRecord.hp_owner_address || 'N/A'}`);
    console.log(`Creator Address:  ${latestRecord.hp_creator_address || 'N/A'}`);
    console.log(`Deployer Address: ${latestRecord.hp_deployer_address || 'N/A'}`);

    // Additional Data Section
    console.log('\nAdditional Data:');
    console.log('━'.repeat(100));
    Object.entries(latestRecord).forEach(([key, value]) => {
      // Skip fields we've already shown in other sections
      if (!key.startsWith('token_') && !key.startsWith('hp_') && key !== 'scan_timestamp' && key !== 'pair_address') {
        console.log(`${key.padEnd(maxLength)}: ${value}`);
      }
    });

    console.log('\nScan Information:');
    console.log('━'.repeat(100));
    console.log(`Scan Timestamp:   ${latestRecord.scan_timestamp}`);

  } catch (err) {
    console.error('Error printing latest record:', err);
  }
}

// Add this before starting the server
async function listAllTables() {
  try {
    const tables = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table'
      ORDER BY name
    `);
    
    console.log('\n=== All Database Tables ===');
    tables.forEach(table => {
      console.log(table.name);
    });
    console.log('===========================\n');
  } catch (err) {
    console.error('Error listing tables:', err);
  }
}

// Test function to verify data retrieval
async function testDataRetrieval() {
  console.log('\n=== Testing Data Retrieval ===');
  try {
    // Get a sample token from scan_records
    const sampleToken = await db.get('SELECT token_address FROM scan_records LIMIT 1');
    if (!sampleToken) {
      console.log('No tokens found in scan_records');
      return;
    }
    console.log('Sample token address:', sampleToken.token_address);

    // Find the history table for this token
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE ?",
      [`%${sampleToken.token_address.toLowerCase()}%`]
    );
    console.log('Found tables:', tables);

    if (tables.length === 0) {
      console.log('No history table found for token');
      return;
    }

    const historyTable = tables[0].name;
    console.log('Using history table:', historyTable);

    // Get table structure
    const tableInfo = await db.all(`PRAGMA table_info("${historyTable}")`);
    console.log('Table columns:', tableInfo.map(col => col.name));

    // Query the last 5 records
    const records = await db.all(`
      SELECT scan_timestamp, hp_liquidity_amount, gp_dex_info
      FROM "${historyTable}"
      ORDER BY scan_timestamp DESC
      LIMIT 5
    `);

    console.log('\nSample records:');
    records.forEach(record => {
      let gpLiquidity = 0;
      if (record.gp_dex_info) {
        try {
          const dexInfo = JSON.parse(record.gp_dex_info);
          if (Array.isArray(dexInfo) && dexInfo[0] && dexInfo[0].liquidity) {
            gpLiquidity = parseFloat(dexInfo[0].liquidity);
          }
        } catch (e) {
          console.error('Error parsing gp_dex_info:', e);
        }
      }

      console.log({
        timestamp: record.scan_timestamp,
        hp_liquidity: record.hp_liquidity_amount,
        gp_liquidity: gpLiquidity,
        total_liquidity: (parseFloat(record.hp_liquidity_amount) || 0) + gpLiquidity
      });
    });
  } catch (err) {
    console.error('Error in test data retrieval:', err);
  }
}

// Start the server
testDataRetrieval().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`Server running on ${HOST}:${PORT}`);
    updateStatus('Server started, waiting for connections...', 'yellow');
  });
});
