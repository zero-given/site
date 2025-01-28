# API Delay Settings
# These delays help prevent rate limiting and ensure stable API operation
GOPLUS_BASE_DELAY = 5  # Initial delay before first GoPlus API call (reduced from 30)
GOPLUS_RETRY_DELAY = 30  # Delay between GoPlus API retries on failure (reduced from 120)
HONEYPOT_BASE_DELAY = 5  # Delay before Honeypot API call (reduced from 10)

# Debug Output Settings
# Control what information is displayed during program execution
DEBUG_SETTINGS = {
    'GOPLUS_RAW_OUTPUT': True,       # Show raw API responses from GoPlus
    'GOPLUS_FORMATTED': True,        # Show formatted GoPlus data
    'GOPLUS_TABLE': True,           # Show security analysis table
    'HONEYPOT_RAW_OUTPUT': False,    # Show raw Honeypot API responses
    'HONEYPOT_FORMATTED': False,     # Show formatted Honeypot data
    'HONEYPOT_TABLE': True,         # Show token analysis table
    'SHOW_HOLDER_INFO': True,       # Show detailed holder information
    'SHOW_LP_INFO': True,           # Show liquidity provider details
    'SHOW_DEX_INFO': True          # Show DEX trading information
}

import asyncio
import time
import aiohttp
from web3 import Web3, HTTPProvider
from web3.exceptions import TransactionNotFound, ContractLogicError
from typing import Dict, Optional, Tuple, List, Any
from datetime import datetime, timedelta 
import sqlite3
import json
import logging
import os
import sys
import threading
import traceback
import requests
from SPXfucked import TokenTracker
from tabulate import tabulate
from colorama import Fore, Style, init
from key_manager import InfuraKeyManager
from rich.console import Console
from rich.table import Table
from terminal_display import console, create_pair_table, create_security_table, log_message
from api_wrapper import api_wrapper
from api_tracker import api_tracker

init(autoreset=True)  # Initialize colorama

def initialize_database_structure(folder_name: str) -> None:
    """Initialize all required database structures with single record per token"""
    try:
        print(f"Initializing database structure in {folder_name}")
        
        # Create SCAN_RECORDS database
        scan_records_path = os.path.join(os.path.abspath(folder_name), 'SCAN_RECORDS.db')
        print(f"Creating/verifying SCAN_RECORDS database at: {scan_records_path}")
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(scan_records_path), exist_ok=True)
        
        with sqlite3.connect(scan_records_path) as db:
            cursor = db.cursor()
            
            # First, check if the table exists
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='scan_records'")
            table_exists = cursor.fetchone() is not None
            
            if not table_exists:
                print("Creating new scan_records table with all columns...")
                cursor.execute('DROP TABLE IF EXISTS scan_records')
                cursor.execute('''
                CREATE TABLE IF NOT EXISTS scan_records (
                    token_address TEXT PRIMARY KEY,
                    scan_timestamp TEXT NOT NULL,
                    pair_address TEXT,
                    token_name TEXT,
                    token_symbol TEXT,
                    token_decimals INTEGER,
                    token_total_supply TEXT,
                    token_age_hours REAL,
                    hp_simulation_success INTEGER,
                    hp_buy_tax REAL,
                    hp_sell_tax REAL,
                    hp_transfer_tax REAL,
                    hp_liquidity_amount REAL,
                    hp_pair_reserves0 TEXT,
                    hp_pair_reserves1 TEXT,
                    hp_buy_gas_used INTEGER,
                    hp_sell_gas_used INTEGER,
                    hp_creation_time TEXT,
                    hp_holder_count INTEGER,
                    hp_is_honeypot INTEGER,
                    hp_honeypot_reason TEXT,
                    hp_is_open_source INTEGER,
                    hp_is_proxy INTEGER,
                    hp_is_mintable INTEGER,
                    hp_can_be_minted INTEGER,
                    hp_owner_address TEXT,
                    hp_creator_address TEXT,
                    hp_deployer_address TEXT,
                    hp_has_proxy_calls INTEGER,
                    hp_pair_liquidity REAL,
                    hp_pair_liquidity_token0 REAL,
                    hp_pair_liquidity_token1 REAL,
                    hp_pair_token0_symbol TEXT,
                    hp_pair_token1_symbol TEXT,
                    hp_flags TEXT,
                    gp_is_open_source INTEGER,
                    gp_is_proxy INTEGER,
                    gp_is_mintable INTEGER,
                    gp_owner_address TEXT,
                    gp_creator_address TEXT,
                    gp_can_take_back_ownership INTEGER,
                    gp_owner_change_balance INTEGER,
                    gp_hidden_owner INTEGER,
                    gp_selfdestruct INTEGER,
                    gp_external_call INTEGER,
                    gp_buy_tax REAL,
                    gp_sell_tax REAL,
                    gp_is_anti_whale INTEGER,
                    gp_anti_whale_modifiable INTEGER,
                    gp_cannot_buy INTEGER,
                    gp_cannot_sell_all INTEGER,
                    gp_slippage_modifiable INTEGER,
                    gp_personal_slippage_modifiable INTEGER,
                    gp_trading_cooldown INTEGER,
                    gp_is_blacklisted INTEGER,
                    gp_is_whitelisted INTEGER,
                    gp_is_in_dex INTEGER,
                    gp_transfer_pausable INTEGER,
                    gp_can_be_minted INTEGER,
                    gp_total_supply TEXT,
                    gp_holder_count INTEGER,
                    gp_owner_percent REAL,
                    gp_owner_balance TEXT,
                    gp_creator_percent REAL,
                    gp_creator_balance TEXT,
                    gp_lp_holder_count INTEGER,
                    gp_lp_total_supply TEXT,
                    gp_is_true_token INTEGER,
                    gp_is_airdrop_scam INTEGER,
                    gp_trust_list TEXT,
                    gp_other_potential_risks TEXT,
                    gp_note TEXT,
                    gp_honeypot_with_same_creator INTEGER,
                    gp_fake_token INTEGER,
                    gp_holders TEXT,
                    gp_lp_holders TEXT,
                    gp_dex_info TEXT,
                    total_scans INTEGER DEFAULT 1,
                    honeypot_failures INTEGER DEFAULT 0,
                    last_error TEXT,
                    status TEXT DEFAULT 'new',
                    liq10 REAL,
                    liq20 REAL,
                    liq30 REAL,
                    liq40 REAL,
                    liq50 REAL,
                    liq60 REAL,
                    liq70 REAL,
                    liq80 REAL,
                    liq90 REAL,
                    liq100 REAL,
                    liq110 REAL,
                    liq120 REAL,
                    liq130 REAL,
                    liq140 REAL,
                    liq150 REAL,
                    liq160 REAL,
                    liq170 REAL,
                    liq180 REAL,
                    liq190 REAL,
                    liq200 REAL
                )''')
                
                # Create indexes
                print("Creating indexes...")
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_scan_timestamp ON scan_records(scan_timestamp)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_token_age ON scan_records(token_age_hours DESC)')
                
                # Create xHoneypot_removed table
                print("Creating xHoneypot_removed table...")
                cursor.execute('''
                CREATE TABLE IF NOT EXISTS xHoneypot_removed (
                    token_address TEXT PRIMARY KEY,
                    removal_timestamp TEXT NOT NULL,
                    original_scan_timestamp TEXT,
                    token_name TEXT,
                    token_symbol TEXT,
                    token_decimals INTEGER,
                    token_total_supply TEXT,
                    token_pair_address TEXT,
                    token_age_hours REAL,
                    hp_simulation_success INTEGER,
                    hp_buy_tax REAL,
                    hp_sell_tax REAL,
                    hp_transfer_tax REAL,
                    hp_liquidity_amount REAL,
                    hp_pair_reserves0 TEXT,
                    hp_pair_reserves1 TEXT,
                    hp_buy_gas_used INTEGER,
                    hp_sell_gas_used INTEGER,
                    hp_creation_time TEXT,
                    hp_holder_count INTEGER,
                    hp_is_honeypot INTEGER,
                    hp_honeypot_reason TEXT,
                    total_scans INTEGER,
                    honeypot_failures INTEGER,
                    last_error TEXT,
                    removal_reason TEXT
                )''')
                
                cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_removal_timestamp 
                ON xHoneypot_removed(removal_timestamp DESC)
                ''')
                
                db.commit()
                print("Database structure initialized successfully")
            else:
                print("Database tables already exist")
    except Exception as e:
        print(f"Error initializing database: {str(e)}")
        print("Full traceback:")
        import traceback
        traceback.print_exc()
        raise

def get_folder_name() -> str:
    """Get the session folder name based on current date"""
    try:
        # Get the current script's directory
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Format current date
        current_date = datetime.now().strftime("%B %d")
        session_number = 1
        
        while True:
            # Create folder name
            folder_name = f"{current_date} - Session {session_number}"
            # Create full path
            full_path = os.path.join(base_dir, folder_name)
            
            # Check if folder exists
            if os.path.exists(full_path):
                session_number += 1
            else:
                print(f"Selected folder name: {folder_name}")
                return str(folder_name)  # Ensure we return a string
    except Exception as e:
        print(f"Error in get_folder_name: {str(e)}")
        print("Full traceback:")
        import traceback
        traceback.print_exc()
        raise

def format_table_output(goplus_data: dict) -> None:
    """Format GoPlus data into nice tables similar to go.py output"""
    if not isinstance(goplus_data, dict) or 'result' not in goplus_data:
        print("Invalid GoPlus data format")
        return
        
    # Get the first (and only) token data from result
    token_address = list(goplus_data['result'].keys())[0]
    token_data = goplus_data['result'][token_address]
    
    print("\nGoPlus Security Analysis:")
    print("=" * 50)

    # Contract Info
    contract_info = [
        ('is_open_source', 'Yes' if str(token_data.get('is_open_source', '0')) == '1' else 'No'),
        ('is_proxy', 'Yes' if str(token_data.get('is_proxy', '0')) == '1' else 'No'),
        ('is_mintable', 'Yes' if str(token_data.get('is_mintable', '0')) == '1' else 'No'),
        ('can_take_back_ownership', token_data.get('can_take_back_ownership', '0')),
        ('owner_change_balance', token_data.get('owner_change_balance', '0')),
        ('hidden_owner', token_data.get('hidden_owner', '0'))
    ]
    
    # Token Info
    token_info = [
        ('token_name', token_data.get('token_name', 'Unknown')),
        ('token_symbol', token_data.get('token_symbol', 'Unknown')),
        ('total_supply', token_data.get('total_supply', '0')),
        ('holder_count', token_data.get('holder_count', '0')),
        ('lp_holder_count', token_data.get('lp_holder_count', '0')),
        ('lp_total_supply', token_data.get('lp_total_supply', '0'))
    ]
    
    # Owner Info
    owner_info = [
        ('owner_address', token_data.get('owner_address', '')),
        ('creator_address', token_data.get('creator_address', '')),
        ('owner_balance', token_data.get('owner_balance', '0')),
        ('owner_percent', token_data.get('owner_percent', '0')),
        ('creator_percent', token_data.get('creator_percent', '0')),
        ('creator_balance', token_data.get('creator_balance', '0'))
    ]
    
    # Trading Info
    trading_info = [
        ('buy_tax', token_data.get('buy_tax', '0')),
        ('sell_tax', token_data.get('sell_tax', '0')),
        ('cannot_buy', token_data.get('cannot_buy', '0')),
        ('cannot_sell_all', token_data.get('cannot_sell_all', '0')),
        ('slippage_modifiable', token_data.get('slippage_modifiable', '0')),
        ('personal_slippage_modifiable', token_data.get('personal_slippage_modifiable', '0'))
    ]

    # Print contract and token info side by side
    contract_table = tabulate(contract_info, headers=['Contract Info', 'Value'], tablefmt="grid")
    token_table = tabulate(token_info, headers=['Token Info', 'Value'], tablefmt="grid")
    
    # Print tables side by side
    contract_lines = contract_table.split('\n')
    token_lines = token_table.split('\n')
    max_contract_width = max(len(line) for line in contract_lines)
    
    for c_line, t_line in zip(contract_lines, token_lines):
        print(f"{c_line:<{max_contract_width}} {t_line}")
    
    print("\n")
    
    # Print owner and trading info side by side
    owner_table = tabulate(owner_info, headers=['Owner Info', 'Value'], tablefmt="grid")
    trading_table = tabulate(trading_info, headers=['Trading Info', 'Value'], tablefmt="grid")
    
    owner_lines = owner_table.split('\n')
    trading_lines = trading_table.split('\n')
    max_owner_width = max(len(line) for line in owner_lines)
    
    for o_line, t_line in zip(owner_lines, trading_lines):
        print(f"{o_line:<{max_owner_width}} {t_line}")
    
    # Print holder info with proper validation
    print("\nHolder Information:")
    holders = token_data.get('holders', [])
    if holders and isinstance(holders, list):
        print("\nTop Holders:")
        holder_rows = []
        for holder in holders[:10]:  # Show top 10 holders
            if isinstance(holder, dict):  # Make sure holder is a dictionary
                holder_rows.append([
                    holder.get('address', 'Unknown'),
                    holder.get('balance', 'Unknown'),
                    f"{float(holder.get('percent', 0)) * 100:.2f}%",
                    'Yes' if holder.get('is_locked') else 'No',
                    'Yes' if holder.get('is_contract') else 'No',
                    holder.get('tag', '')
                ])
        if holder_rows:
            print(tabulate(holder_rows, 
                         headers=['Address', 'Balance', 'Percent', 'Locked', 'Contract', 'Tag'],
                         tablefmt="grid"))
    
    # Print LP holder info with proper validation
    lp_holders = token_data.get('lp_holders', [])
    if lp_holders and isinstance(lp_holders, list):
        print("\nLP Holders:")
        lp_rows = []
        for holder in lp_holders:
            if isinstance(holder, dict):  # Make sure holder is a dictionary
                lp_rows.append([
                    holder.get('address', 'Unknown'),
                    holder.get('balance', 'Unknown'),
                    f"{float(holder.get('percent', 0)) * 100:.2f}%",
                    'Yes' if holder.get('is_locked') else 'No',
                    'Yes' if holder.get('is_contract') else 'No',
                    holder.get('tag', '')
                ])
        if lp_rows:
            print(tabulate(lp_rows,
                         headers=['Address', 'Balance', 'Percent', 'Locked', 'Contract', 'Tag'],
                         tablefmt="grid"))
    
    # Print DEX info with validation
    dex_info = token_data.get('dex', [])
    if dex_info:
        print("\nDEX Info:")
        print(json.dumps(dex_info, indent=2))


def prepare_goplus_values(self, goplus_data: dict, token_address: str) -> tuple:
    """
    Helper function to properly extract and validate GoPlus API values
    
    Args:
        goplus_data: Raw API response from GoPlus
        token_address: Token contract address
        
    Returns:
        Tuple of validated and formatted values for database storage
    """
    # Initialize token_data with empty dict if not found
    token_data = {}
    
    # Check if we have valid response data
    if isinstance(goplus_data, dict) and 'result' in goplus_data:
        # Try both lowercase and original address
        token_data = (goplus_data['result'].get(token_address.lower()) or 
                     goplus_data['result'].get(token_address) or {})

    def safe_int_bool(value):
        """Safely convert string to int boolean (0 or 1)"""
        if isinstance(value, bool):
            return 1 if value else 0
        try:
            return 1 if str(value).strip() == '1' else 0
        except:
            return 0
    
    def safe_float(value, default=0.0):
        """Safely convert string to float"""
        if value is None:
            return default
        try:
            if isinstance(value, (int, float)):
                return float(value)
            cleaned = str(value).replace('%', '').strip()
            return float(cleaned) if cleaned else default
        except:
            return default

    def safe_str(value, default=''):
        """Safely convert value to string"""
        return str(value) if value is not None else default
    
    def safe_int(value, default=0):
        """Safely convert value to integer"""
        if value is None:
            return default
        try:
            if isinstance(value, str):
                cleaned = ''.join(c for c in value if c.isdigit() or c == '.')
                return int(float(cleaned)) if cleaned else default
            return int(float(str(value)))
        except:
            return default

    # Return tuple with safe default values if data is missing
    return (
        safe_int_bool(token_data.get('is_open_source')),
        safe_int_bool(token_data.get('is_proxy')),
        safe_int_bool(token_data.get('is_mintable')),
        safe_str(token_data.get('owner_address')),
        safe_str(token_data.get('creator_address')),
        safe_int_bool(token_data.get('can_take_back_ownership')),
        safe_int_bool(token_data.get('owner_change_balance')),
        safe_int_bool(token_data.get('hidden_owner')),
        safe_int_bool(token_data.get('selfdestruct')),
        safe_int_bool(token_data.get('external_call')),
        safe_float(token_data.get('buy_tax')),
        safe_float(token_data.get('sell_tax')),
        safe_int_bool(token_data.get('is_anti_whale')),
        safe_int_bool(token_data.get('anti_whale_modifiable')),
        safe_int_bool(token_data.get('cannot_buy')),
        safe_int_bool(token_data.get('cannot_sell_all')),
        safe_int_bool(token_data.get('slippage_modifiable')),
        safe_int_bool(token_data.get('personal_slippage_modifiable')),
        safe_int_bool(token_data.get('trading_cooldown')),
        safe_int_bool(token_data.get('is_blacklisted')),
        safe_int_bool(token_data.get('is_whitelisted')),
        safe_int_bool(token_data.get('is_in_dex')),
        safe_int_bool(token_data.get('transfer_pausable')),
        safe_int_bool(token_data.get('can_be_minted')),
        safe_str(token_data.get('total_supply', '0')),
        safe_int(token_data.get('holder_count')),
        safe_float(token_data.get('owner_percent')),
        safe_str(token_data.get('owner_balance', '0')),
        safe_float(token_data.get('creator_percent')),
        safe_str(token_data.get('creator_balance', '0')),
        safe_int(token_data.get('lp_holder_count')),
        safe_str(token_data.get('lp_total_supply', '0')),
        safe_int_bool(token_data.get('is_true_token')),
        safe_int_bool(token_data.get('is_airdrop_scam')),
        json.dumps(token_data.get('trust_list', {})),
        json.dumps(token_data.get('other_potential_risks', [])),
        safe_str(token_data.get('note')),
        safe_int_bool(token_data.get('honeypot_with_same_creator')),
        safe_int_bool(token_data.get('fake_token')),
        json.dumps(token_data.get('holders', [])),
        json.dumps(token_data.get('lp_holders', [])),
        json.dumps(token_data.get('dex', []))
    )


class TokenChecker:
    def __init__(self, tracker: TokenTracker, folder_name: str):
        self.tracker = tracker
        self.folder_name = folder_name
        self.web3 = Web3(HTTPProvider(self.tracker.config.node_rpc))
        self.logger = tracker.logger
        self.config = tracker.config
        self.goplus_cache = {}  # Cache for GoPlus API responses
        self.cache_duration = 300  # Cache duration in seconds (5 minutes)
        self.ensure_database_ready()

    def ensure_database_ready(self):
        """Ensure database and tables exist before operations"""
        db_path = os.path.join(self.folder_name, 'scan_records.db')
        
        # Ensure directory exists
        os.makedirs(self.folder_name, exist_ok=True)
        
        try:
            with sqlite3.connect(db_path) as db:
                cursor = db.cursor()
                cursor.execute('''
                CREATE TABLE IF NOT EXISTS scan_records (
                    token_address TEXT PRIMARY KEY,
                    scan_timestamp TEXT NOT NULL,
                    pair_address TEXT,
                    token_name TEXT,
                    token_symbol TEXT,
                    token_decimals INTEGER,
                    token_total_supply TEXT,
                    token_age_hours REAL,
                    hp_simulation_success INTEGER,
                    hp_buy_tax REAL,
                    hp_sell_tax REAL,
                    hp_transfer_tax REAL,
                    hp_liquidity_amount REAL,
                    hp_pair_reserves0 TEXT,
                    hp_pair_reserves1 TEXT,
                    hp_buy_gas_used INTEGER,
                    hp_sell_gas_used INTEGER,
                    hp_creation_time TEXT,
                    hp_holder_count INTEGER,
                    hp_is_honeypot INTEGER,
                    hp_honeypot_reason TEXT,
                    hp_is_open_source INTEGER,
                    hp_is_proxy INTEGER,
                    hp_is_mintable INTEGER,
                    hp_can_be_minted INTEGER,
                    hp_owner_address TEXT,
                    hp_creator_address TEXT,
                    hp_deployer_address TEXT,
                    hp_has_proxy_calls INTEGER,
                    hp_pair_liquidity REAL,
                    hp_pair_liquidity_token0 REAL,
                    hp_pair_liquidity_token1 REAL,
                    hp_pair_token0_symbol TEXT,
                    hp_pair_token1_symbol TEXT,
                    hp_flags TEXT,
                    gp_is_open_source INTEGER,
                    gp_is_proxy INTEGER,
                    gp_is_mintable INTEGER,
                    gp_owner_address TEXT,
                    gp_creator_address TEXT,
                    gp_can_take_back_ownership INTEGER,
                    gp_owner_change_balance INTEGER,
                    gp_hidden_owner INTEGER,
                    gp_selfdestruct INTEGER,
                    gp_external_call INTEGER,
                    gp_buy_tax REAL,
                    gp_sell_tax REAL,
                    gp_is_anti_whale INTEGER,
                    gp_anti_whale_modifiable INTEGER,
                    gp_cannot_buy INTEGER,
                    gp_cannot_sell_all INTEGER,
                    gp_slippage_modifiable INTEGER,
                    gp_personal_slippage_modifiable INTEGER,
                    gp_trading_cooldown INTEGER,
                    gp_is_blacklisted INTEGER,
                    gp_is_whitelisted INTEGER,
                    gp_is_in_dex INTEGER,
                    gp_transfer_pausable INTEGER,
                    gp_can_be_minted INTEGER,
                    gp_total_supply TEXT,
                    gp_holder_count INTEGER,
                    gp_owner_percent REAL,
                    gp_owner_balance TEXT,
                    gp_creator_percent REAL,
                    gp_creator_balance TEXT,
                    gp_lp_holder_count INTEGER,
                    gp_lp_total_supply TEXT,
                    gp_is_true_token INTEGER,
                    gp_is_airdrop_scam INTEGER,
                    gp_trust_list TEXT,
                    gp_other_potential_risks TEXT,
                    gp_note TEXT,
                    gp_honeypot_with_same_creator INTEGER,
                    gp_fake_token INTEGER,
                    gp_holders TEXT,
                    gp_lp_holders TEXT,
                    gp_dex_info TEXT,
                    total_scans INTEGER DEFAULT 1,
                    honeypot_failures INTEGER DEFAULT 0,
                    last_error TEXT,
                    status TEXT DEFAULT 'new',
                    liq10 REAL,
                    liq20 REAL,
                    liq30 REAL,
                    liq40 REAL,
                    liq50 REAL,
                    liq60 REAL,
                    liq70 REAL,
                    liq80 REAL,
                    liq90 REAL,
                    liq100 REAL,
                    liq110 REAL,
                    liq120 REAL,
                    liq130 REAL,
                    liq140 REAL,
                    liq150 REAL,
                    liq160 REAL,
                    liq170 REAL,
                    liq180 REAL,
                    liq190 REAL,
                    liq200 REAL
                )''')
                db.commit()
                print(f"Verified scan_records table exists in {self.folder_name}")
        except sqlite3.Error as e:
            print(f"Database error during table verification: {str(e)}")
            raise

    async def check_honeypot(self, address: str) -> Dict:
        """Check token using Honeypot API with improved tracking"""
        return await api_wrapper.call_honeypot_api(address, delay=HONEYPOT_BASE_DELAY)

    async def check_goplus(self, address: str) -> Dict:
        """Check token using GoPlus API with improved tracking"""
        return await api_wrapper.call_goplus_api(address, delay=GOPLUS_BASE_DELAY)

    async def process_new_pair(self, token_address: str, pair_address: str):
        """Process and update token data silently"""
        # Remove duplicate API calls - just call process_token
        await self.process_token(token_address, pair_address)

    async def process_token(self, token_address: str, pair_address: str):
        """Process a token by checking its honeypot status and other data"""
        try:
            print("\n" + "="*80)
            log_message(f"Processing Token: {token_address}", "INFO")
            log_message(f"Pair Address: {pair_address}", "INFO")
            print("="*80 + "\n")

            # Create tasks for both API calls
            honeypot_task = asyncio.create_task(self.check_honeypot(token_address))
            goplus_task = asyncio.create_task(self.check_goplus(token_address))
            
            # Wait for both tasks with timeout
            try:
                honeypot_data, goplus_data = await asyncio.gather(
                    honeypot_task,
                    goplus_task,
                    return_exceptions=True
                )
                
                # Check for exceptions
                if isinstance(honeypot_data, Exception):
                    log_message(f"Honeypot API error: {str(honeypot_data)}", "ERROR")
                    honeypot_data = {}
                
                if isinstance(goplus_data, Exception):
                    log_message(f"GoPlus API error: {str(goplus_data)}", "ERROR")
                    goplus_data = {}

            except asyncio.TimeoutError:
                log_message("API calls timed out", "ERROR")
                honeypot_data = {}
                goplus_data = {}

            # Display honeypot data in a nice table
            if honeypot_data:
                # Token Info
                token_info = honeypot_data.get('token', {})
                pair_info = honeypot_data.get('pair', {})
                simulation = honeypot_data.get('simulationResult', {})
                contract = honeypot_data.get('contractCode', {})
                honeypot_result = honeypot_data.get('honeypotResult', {})
                holder_analysis = honeypot_data.get('holderAnalysis', {})

                pair_data = {
                    "Token Info": {
                        "Token Address": token_address,
                        "Pair Address": pair_address,
                        "Token Name": token_info.get('name', 'Unknown'),
                        "Token Symbol": token_info.get('symbol', 'Unknown'),
                        "Decimals": token_info.get('decimals', 'Unknown'),
                        "Total Supply": token_info.get('totalSupply', '0'),
                        "Total Holders": token_info.get('totalHolders', '0')
                    },
                    "Pair Info": {
                        "Liquidity": f"${float(pair_info.get('liquidity', 0)):,.2f}",
                        "Creation Time": pair_info.get('createdAtTimestamp', 'Unknown'),
                        "Reserves Token0": pair_info.get('reserves0', '0'),
                        "Reserves Token1": pair_info.get('reserves1', '0'),
                        "Creation Tx": pair_info.get('creationTxHash', 'Unknown')
                    },
                    "Simulation": {
                        "Success": "Yes" if honeypot_data.get('simulationSuccess', False) else "No",
                        "Buy Tax": f"{float(simulation.get('buyTax', 0)):.2f}%",
                        "Sell Tax": f"{float(simulation.get('sellTax', 0)):.2f}%",
                        "Transfer Tax": f"{float(simulation.get('transferTax', 0)):.2f}%",
                        "Buy Gas": simulation.get('buyGas', 'Unknown'),
                        "Sell Gas": simulation.get('sellGas', 'Unknown')
                    },
                    "Contract": {
                        "Open Source": "Yes" if contract.get('openSource', False) else "No",
                        "Is Proxy": "Yes" if contract.get('isProxy', False) else "No",
                        "Has Proxy Calls": "Yes" if contract.get('hasProxyCalls', False) else "No"
                    },
                    "Honeypot Analysis": {
                        "Is Honeypot": "Yes" if honeypot_result.get('isHoneypot', True) else "No",
                        "Honeypot Reason": honeypot_result.get('honeypotReason', 'None'),
                        "Risk Level": honeypot_data.get('summary', {}).get('riskLevel', 'Unknown'),
                        "Risk Type": honeypot_data.get('summary', {}).get('risk', 'Unknown')
                    },
                    "Holder Analysis": {
                        "Total Holders": holder_analysis.get('holders', '0'),
                        "Successful Txs": holder_analysis.get('successful', '0'),
                        "Failed Txs": holder_analysis.get('failed', '0'),
                        "Average Tax": f"{float(holder_analysis.get('averageTax', 0)):.2f}%",
                        "Average Gas": holder_analysis.get('averageGas', '0'),
                        "Highest Tax": f"{float(holder_analysis.get('highestTax', 0)):.2f}%",
                        "High Tax Wallets": holder_analysis.get('highTaxWallets', '0'),
                        "Snipers Failed": holder_analysis.get('snipersFailed', '0'),
                        "Snipers Success": holder_analysis.get('snipersSuccess', '0')
                    }
                }
                console.print(create_pair_table(pair_data))
            
            # Process GoPlus data
            if goplus_data and isinstance(goplus_data, dict) and 'result' in goplus_data:
                # Extract token data from GoPlus response
                token_data = None
                if 'result' in goplus_data:
                    token_data = (goplus_data['result'].get(token_address.lower()) or 
                                goplus_data['result'].get(token_address))

                if token_data:
                    # Create security data dictionary
                    security_data = {
                        "Token Info": {
                            "passed": True,
                            "details": f"Name: {token_data.get('token_name')}\nSymbol: {token_data.get('token_symbol')}\nTotal Supply: {token_data.get('total_supply')}"
                        },
                        "Security Status": {
                            "passed": not any([
                                bool(int(token_data.get('is_honeypot', '0'))),
                                bool(int(token_data.get('honeypot_with_same_creator', '0'))),
                                bool(int(token_data.get('is_blacklisted', '0')))
                            ]),
                            "details": "\n".join([
                                f"Is Honeypot: {'Yes' if bool(int(token_data.get('is_honeypot', '0'))) else 'No'}",
                                f"Honeypot Same Creator: {'Yes' if bool(int(token_data.get('honeypot_with_same_creator', '0'))) else 'No'}",
                                f"Blacklisted: {'Yes' if bool(int(token_data.get('is_blacklisted', '0'))) else 'No'}",
                                f"Whitelisted: {'Yes' if bool(int(token_data.get('is_whitelisted', '0'))) else 'No'}"
                            ])
                        },
                        "Contract": {
                            "passed": bool(int(token_data.get('is_open_source', '0'))),
                            "details": "\n".join([
                                f"Open Source: {'Yes' if bool(int(token_data.get('is_open_source', '0'))) else 'No'}",
                                f"Proxy: {'Yes' if bool(int(token_data.get('is_proxy', '0'))) else 'No'}",
                                f"Mintable: {'Yes' if bool(int(token_data.get('is_mintable', '0'))) else 'No'}",
                                f"External Calls: {'Yes' if bool(int(token_data.get('external_call', '0'))) else 'No'}",
                                f"Can Self-Destruct: {'Yes' if bool(int(token_data.get('selfdestruct', '0'))) else 'No'}"
                            ])
                        },
                        "Taxes": {
                            "passed": float(token_data.get('buy_tax', '100')) <= 10 and float(token_data.get('sell_tax', '100')) <= 10,
                            "details": "\n".join([
                                f"Buy Tax: {float(token_data.get('buy_tax', '0')):.2f}%",
                                f"Sell Tax: {float(token_data.get('sell_tax', '0')):.2f}%"
                            ])
                        },
                        "Ownership": {
                            "passed": not any([
                                bool(int(token_data.get('hidden_owner', '0'))),
                                bool(int(token_data.get('can_take_back_ownership', '0'))),
                                bool(int(token_data.get('owner_change_balance', '0')))
                            ]),
                            "details": "\n".join([
                                f"Hidden Owner: {'Yes' if bool(int(token_data.get('hidden_owner', '0'))) else 'No'}",
                                f"Can Take Back Ownership: {'Yes' if bool(int(token_data.get('can_take_back_ownership', '0'))) else 'No'}",
                                f"Owner Change Balance: {'Yes' if bool(int(token_data.get('owner_change_balance', '0'))) else 'No'}",
                                f"Owner Address: {token_data.get('owner_address', 'Unknown')}",
                                f"Owner Balance: {token_data.get('owner_balance', '0')}",
                                f"Owner Percent: {float(token_data.get('owner_percent', '0')) * 100:.2f}%"
                            ])
                        },
                        "Trading Restrictions": {
                            "passed": not any([
                                bool(int(token_data.get('cannot_buy', '0'))),
                                bool(int(token_data.get('cannot_sell_all', '0'))),
                                bool(int(token_data.get('trading_cooldown', '0'))),
                                bool(int(token_data.get('transfer_pausable', '0')))
                            ]),
                            "details": "\n".join([
                                f"Cannot Buy: {'Yes' if bool(int(token_data.get('cannot_buy', '0'))) else 'No'}",
                                f"Cannot Sell All: {'Yes' if bool(int(token_data.get('cannot_sell_all', '0'))) else 'No'}",
                                f"Trading Cooldown: {'Yes' if bool(int(token_data.get('trading_cooldown', '0'))) else 'No'}",
                                f"Transfer Pausable: {'Yes' if bool(int(token_data.get('transfer_pausable', '0'))) else 'No'}"
                            ])
                        },
                        "Anti-Whale": {
                            "passed": True,
                            "details": "\n".join([
                                f"Anti-Whale: {'Yes' if bool(int(token_data.get('is_anti_whale', '0'))) else 'No'}",
                                f"Anti-Whale Modifiable: {'Yes' if bool(int(token_data.get('anti_whale_modifiable', '0'))) else 'No'}",
                                f"Slippage Modifiable: {'Yes' if bool(int(token_data.get('slippage_modifiable', '0'))) else 'No'}",
                                f"Personal Slippage Modifiable: {'Yes' if bool(int(token_data.get('personal_slippage_modifiable', '0'))) else 'No'}"
                            ])
                        },
                        "Holders": {
                            "passed": True,
                            "details": "\n".join([
                                f"Total Holders: {token_data.get('holder_count', '0')}",
                                f"LP Holders: {token_data.get('lp_holder_count', '0')}",
                                f"Creator Balance: {token_data.get('creator_balance', '0')}",
                                f"Creator %: {float(token_data.get('creator_percent', '0')) * 100:.2f}%",
                                f"LP Total Supply: {token_data.get('lp_total_supply', '0')}"
                            ])
                        },
                        "Liquidity": {
                            "passed": True,
                            "details": "\n".join(
                                [f"{dex['name']}: ${float(dex.get('liquidity', 0)):,.2f}" for dex in token_data.get('dex', [])]
                                + ["\nTop Holders:"]
                                + [f"{h['address']}: {float(h.get('percent', 0))*100:.2f}% ({'Locked' if h.get('is_locked') else 'Unlocked'})"
                                   for h in token_data.get('holders', [])[:3]]
                            )
                        }
                    }
                    
                    # Print the security analysis table
                    print("\nGoPlus Security Analysis:")
                    print("=" * 50)
                    console.print(create_security_table(security_data))
                else:
                    log_message("No token data found in GoPlus response", "WARNING")
                    print("\nGoPlus Debug Info:")
                    print("=" * 50)
                    print(f"Response has 'result' key: Yes")
                    print(f"Result contents: {json.dumps(goplus_data['result'], indent=2)}")
                    print(f"Tried addresses:")
                    print(f"  - Lowercase: {token_address.lower()}")
                    print(f"  - Original: {token_address}")
            else:
                log_message("Invalid or missing GoPlus data format", "WARNING")
                print("\nGoPlus Debug Info:")
                print("=" * 50)
                print(f"Response is dict: {isinstance(goplus_data, dict)}")
                print(f"Response has 'result' key: {'result' in goplus_data if isinstance(goplus_data, dict) else False}")
                print(f"Raw response: {json.dumps(goplus_data, indent=2)}")

            # Print API stats after GoPlus output
            print("\nAPI Call Statistics:")
            print("=" * 50)
            api_tracker.print_stats()

            return True

        except Exception as e:
            log_message(f"Error processing token: {str(e)}", "ERROR")
            print("Full traceback:")
            traceback.print_exc()
            return False

    async def process_rescan_tokens(self):
        """Process tokens that need rescanning"""
        try:
            db_path = os.path.join(self.folder_name, 'scan_records.db')
            print("\nChecking for tokens to rescan...")
            
            with sqlite3.connect(db_path) as db:
                cursor = db.cursor()
                
                # First check how many tokens are in the database
                cursor.execute('SELECT COUNT(*) FROM scan_records WHERE status = "active"')
                total_active = cursor.fetchone()[0]
                print(f"Total active tokens in database: {total_active}")
                
                # Get tokens that need rescanning - reduced to 1 at a time
                cursor.execute('''
                    SELECT token_address, pair_address, total_scans, scan_timestamp
                    FROM scan_records 
                    WHERE total_scans < ? 
                    AND status = 'active'
                    ORDER BY scan_timestamp ASC
                    LIMIT 1
                ''', (1000,))  # Hard-coded max rescans for now
                
                tokens = cursor.fetchall()
                print(f"Found {len(tokens)} tokens eligible for rescan")
                
                if tokens:
                    rescan_table = Table(title="[bold yellow]RESCAN QUEUE", border_style="yellow")
                    rescan_table.add_column("Token", style="cyan")
                    rescan_table.add_column("Pair", style="green")
                    rescan_table.add_column("Scan #", style="magenta")
                    rescan_table.add_column("Last Scan", style="blue")
                    
                    for token_address, pair_address, total_scans, scan_timestamp in tokens:
                        rescan_table.add_row(
                            token_address[:10] + "...",
                            pair_address[:10] + "...",
                            str(total_scans + 1),
                            scan_timestamp
                        )
                    
                    console.print(rescan_table)
                    
                    for token_address, pair_address, total_scans, scan_timestamp in tokens:
                        print(f"\nRescanning token {token_address}")
                        print(f"Current scan count: {total_scans}")
                        print(f"Last scan time: {scan_timestamp}")
                        await self.process_token(token_address, pair_address)
                        await asyncio.sleep(5)  # Increased delay between rescans
                else:
                    log_message("No tokens need rescanning at this time", "INFO")
                
        except Exception as e:
            log_message(f"Error in process_rescan_tokens: {str(e)}", "ERROR")
            print("\nFull traceback:")
            traceback.print_exc()

    def get_next_spinner(self):
        """Get next spinner character and rotate index"""
        char = self.spinner_chars[self.spinner_idx]
        self.spinner_idx = (self.spinner_idx + 1) % len(self.spinner_chars)
        return char

    def get_rescan_status_table(self, current_time, last_rescan_time, rescan_interval):
        """Create a table showing rescan status and countdown"""
        status_table = Table(title="[bold cyan]Rescan Status", border_style="cyan", box=None)
        status_table.add_column("Active Tokens", style="green")
        status_table.add_column("Next Rescan In", style="yellow")
        status_table.add_column("Last Rescan", style="blue")
        
        # Calculate time until next rescan
        time_since_last = (current_time - last_rescan_time).total_seconds()
        time_until_next = max(0, rescan_interval - time_since_last)
        minutes = int(time_until_next // 60)
        seconds = int(time_until_next % 60)
        
        # Get active token count
        try:
            db_path = os.path.join(self.folder_name, 'scan_records.db')
            with sqlite3.connect(db_path) as db:
                cursor = db.cursor()
                cursor.execute('SELECT COUNT(*) FROM scan_records WHERE status = "active"')
                active_count = cursor.fetchone()[0]
                
                # Get last scan info
                cursor.execute('''
                    SELECT token_address, scan_timestamp, total_scans 
                    FROM scan_records 
                    WHERE status = "active"
                    ORDER BY scan_timestamp DESC
                    LIMIT 1
                ''')
                last_scan = cursor.fetchone()
                if last_scan:
                    last_token = f"{last_scan[0][:8]}... (Scan #{last_scan[2]})"
                    last_time = last_scan[1]
                else:
                    last_token = "None"
                    last_time = "Never"
                
        except Exception:
            active_count = "?"
            last_token = "Error"
            last_time = "Error"
        
        status_table.add_row(
            f"{active_count} tokens",
            f"{minutes:02d}:{seconds:02d}",
            f"{last_token} at {last_time}"
        )
        
        return status_table

    async def process_token_safe(self, token_address: str, pair_address: str):
        """Process a token with semaphore to prevent parallel execution"""
        async with self.process_semaphore:
            await self.checker.process_token(token_address, pair_address)

    def stop(self):
        """Gracefully stop the main loop"""
        self.running = False

    async def main_loop(self):
        """Main event loop with API tracking"""
        print("\n=== Initializing Main Loop ===")
        last_check_time = datetime.now()
        last_rescan_time = datetime.now()
        check_interval = 1  # seconds between new pair checks
        rescan_interval = self.config['scanning']['rescan_interval']  # Get from config
        
        if not self.event_filter:
            print("Error: Event filter not initialized")
            return
        
        print("\nMonitoring Configuration:")
        config_table = Table(show_header=False, border_style="bold white")
        config_table.add_column("Setting", style="cyan")
        config_table.add_column("Value", style="green")
        config_table.add_row("Check Interval", f"{check_interval} seconds")
        config_table.add_row("Rescan Interval", f"{rescan_interval} seconds")
        config_table.add_row("Max Rescans", str(self.config['scanning']['max_rescan_count']))
        config_table.add_row("Honeypot Failure Limit", str(self.config['scanning']['honeypot_failure_limit']))
        console.print(config_table)
        
        try:
            # Process last few pairs before starting live monitoring
            print("\nProcessing last 2 pairs before live monitoring...")
            block_table = Table(show_header=False, border_style="bold white")
            block_table.add_column("Field", style="cyan")
            block_table.add_column("Value", style="green")
            
            current_block = await self.tracker.web3.eth.block_number
            start_block = max(current_block - 1000, 0)  # Look back 1000 blocks
            
            block_table.add_row("Current Block", str(current_block))
            block_table.add_row("Start Block", str(start_block))
            console.print(block_table)
            
            # Get historical events
            entries = await self.event_filter.get_all_entries()
            
            # Filter entries to only include WETH pairs
            weth_pairs = []
            for entry in entries:
                token0 = entry['args']['token0']
                token1 = entry['args']['token1']
                pair = entry['args']['pair']
                
                # Check if either token is WETH
                if token0.lower() == self.tracker.weth_address.lower():
                    weth_pairs.append((token1, pair))  # Store non-WETH token and pair
                elif token1.lower() == self.tracker.weth_address.lower():
                    weth_pairs.append((token0, pair))  # Store non-WETH token and pair
            
            # Process only last 2 WETH pairs
            historical_pairs = weth_pairs[-2:] if weth_pairs else []
            print(f"\nFound {len(weth_pairs)} total WETH pairs, processing last {len(historical_pairs)}")
            
            for token_address, pair_address in historical_pairs:
                print(f"\n{'='*80}")
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processing Historical Pair {historical_pairs.index((token_address, pair_address))+1}/{len(historical_pairs)}")
                print(f"Token: {token_address}")
                print(f"Pair: {pair_address}")
                print(f"{'='*80}\n")
                
                try:
                    await self.process_token_safe(token_address, pair_address)
                except Exception as e:
                    print(f"Error processing historical token {token_address}: {str(e)}")
                    continue
                
                # Add delay spinner between historical pairs
                await self.delay_with_spinner(30, "Waiting before next historical pair")
            
            print("\nStarting live monitoring...")
            
            while self.running:
                current_time = datetime.now()
                
                # Check for new pairs on interval
                if (current_time - last_check_time).total_seconds() >= check_interval:
                    try:
                        events = await self.event_filter.get_new_entries()
                        
                        if events:
                            print(f"\nFound {len(events)} new pair(s)")
                            for event in events:
                                token0 = event['args']['token0']
                                token1 = event['args']['token1']
                                pair = event['args']['pair']
                                
                                # Only process the non-WETH token
                                token_to_process = None
                                if token0.lower() == self.tracker.weth_address.lower():
                                    token_to_process = token1
                                elif token1.lower() == self.tracker.weth_address.lower():
                                    token_to_process = token0
                                
                                if token_to_process:
                                    try:
                                        await self.process_token_safe(token_to_process, pair)
                                    except Exception as e:
                                        print(f"Error processing new token {token_to_process}: {str(e)}")
                                        continue
                                    
                                    # Add delay spinner between new pairs
                                    await self.delay_with_spinner(30, "Waiting before next pair")
                                    
                        else:
                            # Update spinner
                            print(f"\r{self.get_next_spinner()} Monitoring for new pairs... ", end="", flush=True)
                            
                        last_check_time = current_time
                        
                    except Exception as e:
                        print(f"\nError checking for new pairs: {str(e)}")
                        await self.delay_with_spinner(5, "Waiting before retry")
                    
                # Small sleep to prevent CPU overuse
                await asyncio.sleep(0.05)
                
        except asyncio.CancelledError:
            print("\n=== Main Loop Cancelled ===")
            print("Shutting down gracefully...")
        except Exception as e:
            print("\n=== Main Loop Fatal Error ===")
            print(f"Error: {str(e)}")
            print("Full traceback:")
            traceback.print_exc()
        finally:
            self.running = False
            await api_wrapper.close()
            print("\n=== Main Loop Stopped ===")
            print(f"Final time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            # Print final stats
            api_tracker.print_stats()

    async def delay_with_spinner(self, seconds: int, message: str):
        """Show a countdown spinner while delaying"""
        start_time = time.time()
        while time.time() - start_time < seconds:
            remaining = int(seconds - (time.time() - start_time))
            spinner = self.get_next_spinner()
            print(f"\r{spinner} {message} ({remaining}s remaining)... ", end="", flush=True)
            await asyncio.sleep(0.1)
        print("\r" + " " * 100 + "\r", end="", flush=True)  # Clear the line


def load_config(config_path):
    """Load and validate configuration from file"""
    try:
        with open(config_path, 'r') as f:
            config = json.load(f)
            
        # Ensure infura_keys is a list
        if not isinstance(config.get('infura_keys', []), list):
            config['infura_keys'] = list(config['infura_keys'])
            
        # Set default values for scanning config
        if 'scanning' not in config:
            config['scanning'] = {}
            
        # Ensure all required scanning values exist with defaults
        scanning_defaults = {
            "rescan_interval": 300,  # 5 minutes
            "max_rescan_count": 1000,
            "remove_after_max_scans": True,
            "honeypot_failure_limit": 5,
            "liquidity_multiplier": 1
        }
        
        for key, default_value in scanning_defaults.items():
            if key not in config['scanning']:
                config['scanning'][key] = default_value
                
        return config
        
    except FileNotFoundError:
        print(f"Config file not found at {config_path}")
        raise
    except json.JSONDecodeError:
        print(f"Invalid JSON in config file: {config_path}")
        raise
    except Exception as e:
        print(f"Error loading config: {str(e)}")
        raise


def get_next_session_number():
    """Get the next session number by checking existing folders"""
    today = datetime.now().strftime('%B %d')
    existing = [d for d in os.listdir() if d.startswith(today)]
    if not existing:
        return 1
    
    # Extract session numbers
    session_nums = []
    for folder in existing:
        try:
            num = int(folder.split('Session ')[-1])
            session_nums.append(num)
        except (ValueError, IndexError):
            continue
            
    return max(session_nums, default=0) + 1


class TokenTrackerMain:
    def __init__(self, config_file, folder_name):
        """Initialize the TokenTrackerMain instance"""
        print(f"Selected folder name: {folder_name}")
        self.folder_name = folder_name
        self.config = load_config(config_file)
        self.tracker = TokenTracker(config_file)  # Pass config file path instead of config dict
        self.checker = TokenChecker(self.tracker, self.folder_name)
        
        # Initialize state variables
        self.running = True
        self.latest_token = None
        self.latest_pair = None
        
        # Initialize spinner
        self.spinner_chars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
        self.spinner_idx = 0
        
        # Add semaphore to prevent parallel processing
        self.process_semaphore = asyncio.Semaphore(1)
        
        # Add last stats print time tracking
        self.last_stats_print = datetime.now()
        
        # Initialize latest pair
        self.initialize_latest_pair()
        
        # Initialize event filter as None, will be set up in async init
        self.event_filter = None
        
        # Initialize key manager first
        self.key_manager = InfuraKeyManager()
        self.key_manager.initialize(
            infura_keys=self.config['infura_keys'],
            key_rotation_interval=int(self.config['key_rotation_interval']),
            key_swap_sleep_time=int(self.config['key_swap_sleep_time'])
        )

    def initialize_latest_pair(self):
        """Initialize latest pair from database"""
        try:
            db_path = os.path.join(self.folder_name, 'scan_records.db')
            with sqlite3.connect(db_path) as db:
                cursor = db.cursor()
                # Get the most recent pair
                cursor.execute('''
                    SELECT token_address, pair_address 
                    FROM scan_records 
                    ORDER BY scan_timestamp DESC 
                    LIMIT 1
                ''')
                result = cursor.fetchone()
                
                if result:
                    self.latest_token = result[0]
                    self.latest_pair = result[1]
                    print(f"Initialized with latest pair: {self.latest_pair}")
                else:
                    print("No previous pairs found in database")
                    self.latest_token = None
                    self.latest_pair = None
                    
        except Exception as e:
            print(f"Error initializing latest pair: {str(e)}")
            print("Full traceback:")
            import traceback
            traceback.print_exc()
            self.latest_token = None
            self.latest_pair = None

    def should_print_stats(self) -> bool:
        """Check if enough time has passed to print stats again"""
        current_time = datetime.now()
        if (current_time - self.last_stats_print).total_seconds() >= 60:
            self.last_stats_print = current_time
            return True
        return False

    async def async_init(self):
        """Async initialization tasks"""
        await self.setup_event_filter()

    async def setup_event_filter(self):
        """Setup event filter for new pairs"""
        try:
            print("Setting up Uniswap event filter...")
            # Create filter looking back more blocks to ensure we find pairs
            current_block = await self.tracker.web3.eth.block_number
            # Look back 1000 blocks to ensure we find some pairs
            start_block = max(current_block - 1000, 0)
            self.event_filter = await self.tracker.factory_contract.events.PairCreated.create_filter(fromBlock=start_block)
            print("Event filter setup successfully")
            
            # Verify filter is working by getting entries
            try:
                entries = await self.event_filter.get_all_entries()
                print(f"Event filter verified working - found {len(entries)} historical entries")
                
                if len(entries) > 0:
                    # Show some info about the entries found
                    print(f"Found pairs from blocks {entries[0]['blockNumber']} to {entries[-1]['blockNumber']}")
                    print(f"Block range searched: {start_block} to {current_block}")
                
            except Exception as e:
                print(f"Warning: Could not verify filter: {str(e)}")
                
        except Exception as e:
            print(f"Error setting up event filter: {str(e)}")
            print("Full traceback:")
            import traceback
            traceback.print_exc()
            raise

    async def delay_with_spinner(self, seconds: int, message: str):
        """Show a countdown spinner while delaying"""
        start_time = time.time()
        while time.time() - start_time < seconds:
            remaining = int(seconds - (time.time() - start_time))
            spinner = self.get_next_spinner()
            print(f"\r{spinner} {message} ({remaining}s remaining)... ", end="", flush=True)
            await asyncio.sleep(0.1)
        print("\r" + " " * 100 + "\r", end="", flush=True)  # Clear the line

    def get_next_spinner(self):
        """Get next spinner character and rotate index"""
        char = self.spinner_chars[self.spinner_idx]
        self.spinner_idx = (self.spinner_idx + 1) % len(self.spinner_chars)
        return char

    def get_rescan_status_table(self, current_time, last_rescan_time, rescan_interval):
        """Create a table showing rescan status and countdown"""
        status_table = Table(title="[bold cyan]Rescan Status", border_style="cyan", box=None)
        status_table.add_column("Active Tokens", style="green")
        status_table.add_column("Next Rescan In", style="yellow")
        status_table.add_column("Last Rescan", style="blue")
        
        # Calculate time until next rescan
        time_since_last = (current_time - last_rescan_time).total_seconds()
        time_until_next = max(0, rescan_interval - time_since_last)
        minutes = int(time_until_next // 60)
        seconds = int(time_until_next % 60)
        
        # Get active token count
        try:
            db_path = os.path.join(self.folder_name, 'scan_records.db')
            with sqlite3.connect(db_path) as db:
                cursor = db.cursor()
                cursor.execute('SELECT COUNT(*) FROM scan_records WHERE status = "active"')
                active_count = cursor.fetchone()[0]
                
                # Get last scan info
                cursor.execute('''
                    SELECT token_address, scan_timestamp, total_scans 
                    FROM scan_records 
                    WHERE status = "active"
                    ORDER BY scan_timestamp DESC
                    LIMIT 1
                ''')
                last_scan = cursor.fetchone()
                if last_scan:
                    last_token = f"{last_scan[0][:8]}... (Scan #{last_scan[2]})"
                    last_time = last_scan[1]
                else:
                    last_token = "None"
                    last_time = "Never"
                
        except Exception:
            active_count = "?"
            last_token = "Error"
            last_time = "Error"
        
        status_table.add_row(
            f"{active_count} tokens",
            f"{minutes:02d}:{seconds:02d}",
            f"{last_token} at {last_time}"
        )
        
        return status_table

    async def process_token_safe(self, token_address: str, pair_address: str):
        """Process a token with semaphore to prevent parallel execution"""
        async with self.process_semaphore:
            await self.checker.process_token(token_address, pair_address)

    def stop(self):
        """Gracefully stop the main loop"""
        self.running = False

    async def main_loop(self):
        """Main event loop with API tracking"""
        print("\n=== Initializing Main Loop ===")
        last_check_time = datetime.now()
        last_rescan_time = datetime.now()
        check_interval = 1  # seconds between new pair checks
        rescan_interval = self.config['scanning']['rescan_interval']  # Get from config
        
        if not self.event_filter:
            print("Error: Event filter not initialized")
            return
        
        print("\nMonitoring Configuration:")
        config_table = Table(show_header=False, border_style="bold white")
        config_table.add_column("Setting", style="cyan")
        config_table.add_column("Value", style="green")
        config_table.add_row("Check Interval", f"{check_interval} seconds")
        config_table.add_row("Rescan Interval", f"{rescan_interval} seconds")
        config_table.add_row("Max Rescans", str(self.config['scanning']['max_rescan_count']))
        config_table.add_row("Honeypot Failure Limit", str(self.config['scanning']['honeypot_failure_limit']))
        console.print(config_table)
        
        try:
            # Process last few pairs before starting live monitoring
            print("\nProcessing last 2 pairs before live monitoring...")
            block_table = Table(show_header=False, border_style="bold white")
            block_table.add_column("Field", style="cyan")
            block_table.add_column("Value", style="green")
            
            current_block = await self.tracker.web3.eth.block_number
            start_block = max(current_block - 1000, 0)  # Look back 1000 blocks
            
            block_table.add_row("Current Block", str(current_block))
            block_table.add_row("Start Block", str(start_block))
            console.print(block_table)
            
            # Get historical events
            entries = await self.event_filter.get_all_entries()
            
            # Filter entries to only include WETH pairs
            weth_pairs = []
            for entry in entries:
                token0 = entry['args']['token0']
                token1 = entry['args']['token1']
                pair = entry['args']['pair']
                
                # Check if either token is WETH
                if token0.lower() == self.tracker.weth_address.lower():
                    weth_pairs.append((token1, pair))  # Store non-WETH token and pair
                elif token1.lower() == self.tracker.weth_address.lower():
                    weth_pairs.append((token0, pair))  # Store non-WETH token and pair
            
            # Process only last 2 WETH pairs
            historical_pairs = weth_pairs[-2:] if weth_pairs else []
            print(f"\nFound {len(weth_pairs)} total WETH pairs, processing last {len(historical_pairs)}")
            
            for token_address, pair_address in historical_pairs:
                print(f"\n{'='*80}")
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processing Historical Pair {historical_pairs.index((token_address, pair_address))+1}/{len(historical_pairs)}")
                print(f"Token: {token_address}")
                print(f"Pair: {pair_address}")
                print(f"{'='*80}\n")
                
                try:
                    await self.process_token_safe(token_address, pair_address)
                except Exception as e:
                    print(f"Error processing historical token {token_address}: {str(e)}")
                    continue
                
                # Add delay spinner between historical pairs
                await self.delay_with_spinner(30, "Waiting before next historical pair")
            
            print("\nStarting live monitoring...")
            
            while self.running:
                current_time = datetime.now()
                
                # Check for new pairs on interval
                if (current_time - last_check_time).total_seconds() >= check_interval:
                    try:
                        events = await self.event_filter.get_new_entries()
                        
                        if events:
                            print(f"\nFound {len(events)} new pair(s)")
                            for event in events:
                                token0 = event['args']['token0']
                                token1 = event['args']['token1']
                                pair = event['args']['pair']
                                
                                # Only process the non-WETH token
                                token_to_process = None
                                if token0.lower() == self.tracker.weth_address.lower():
                                    token_to_process = token1
                                elif token1.lower() == self.tracker.weth_address.lower():
                                    token_to_process = token0
                                
                                if token_to_process:
                                    try:
                                        await self.process_token_safe(token_to_process, pair)
                                    except Exception as e:
                                        print(f"Error processing new token {token_to_process}: {str(e)}")
                                        continue
                                    
                                    # Add delay spinner between new pairs
                                    await self.delay_with_spinner(30, "Waiting before next pair")
                                    
                        else:
                            # Update spinner
                            print(f"\r{self.get_next_spinner()} Monitoring for new pairs... ", end="", flush=True)
                            
                        last_check_time = current_time
                        
                    except Exception as e:
                        print(f"\nError checking for new pairs: {str(e)}")
                        await self.delay_with_spinner(5, "Waiting before retry")
                    
                # Small sleep to prevent CPU overuse
                await asyncio.sleep(0.05)
                
        except asyncio.CancelledError:
            print("\n=== Main Loop Cancelled ===")
            print("Shutting down gracefully...")
        except Exception as e:
            print("\n=== Main Loop Fatal Error ===")
            print(f"Error: {str(e)}")
            print("Full traceback:")
            traceback.print_exc()
        finally:
            self.running = False
            await api_wrapper.close()
            print("\n=== Main Loop Stopped ===")
            print(f"Final time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            # Print final stats
            api_tracker.print_stats()


if __name__ == "__main__":
    print("=== Starting Token Scanner ===")
    print(f"Start time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    
    try:
        # Create session folder
        folder_name = f"{datetime.now().strftime('%B %d')} - Session {get_next_session_number()}"
        os.makedirs(folder_name, exist_ok=True)
        
        print("Initializing scanner...")
        main = TokenTrackerMain("config.json", folder_name)
        
        # Run async initialization and main loop
        loop = asyncio.get_event_loop()
        loop.run_until_complete(main.async_init())
        loop.run_until_complete(main.main_loop())
        
    except KeyboardInterrupt:
        print("\n\nShutting down gracefully...")
        if 'main' in locals():
            main.stop()
    except Exception as e:
        print("\nFatal error:", str(e))
        print("Full traceback:")
        traceback.print_exc()
    finally:
        if 'loop' in locals():
            loop.close()