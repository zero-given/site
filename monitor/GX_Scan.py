# API Delay Settings
# These delays help prevent rate limiting and ensure stable API operation
GOPLUS_BASE_DELAY = 5  # Initial delay before first GoPlus API call (reduced from 30)
GOPLUS_RETRY_DELAY = 25  # Delay between GoPlus API retries on failure (reduced from 120)
HONEYPOT_BASE_DELAY = 5  # Delay before Honeypot API call (reduced from 10)

# Debug Output Settings
# Control what information is displayed during program execution
DEBUG_SETTINGS = {
    'GOPLUS_RAW_OUTPUT': True,       # Show raw API responses from GoPlus
    'GOPLUS_FORMATTED': True,        # Show formatted GoPlus data
    'GOPLUS_TABLE': True,           # Show security analysis table
    'HONEYPOT_RAW_OUTPUT': True,    # Show raw Honeypot API responses
    'HONEYPOT_FORMATTED': True,     # Show formatted Honeypot data
    'HONEYPOT_TABLE': True,         # Show token analysis table
    'SHOW_HOLDER_INFO': True,       # Show detailed holder information
    'SHOW_LP_INFO': True,           # Show liquidity provider details
    'SHOW_DEX_INFO': True          # Show DEX trading information
}

# Token Kick Conditions
# Conditions that will remove tokens from the rescan database
TOKEN_KICK_CONDITIONS = {
    'MAX_AGE_HOURS': 1.0,          # Remove tokens older than this age
    'MIN_LIQUIDITY': 10000.0,      # Remove tokens with liquidity below this amount
    'CHECK_INTERVAL': 300          # Seconds between condition checks
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
        # Get the monitor directory path
        base_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "monitor")
        
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
                
                # Create HONEYPOTS table
                cursor.execute('''
                CREATE TABLE IF NOT EXISTS HONEYPOTS (
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
                
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_honeypot_timestamp ON HONEYPOTS(removal_timestamp)')
                
                # Create scan_records table if it doesn't exist
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
                
                # Create token_tables table to track token-specific tables
                cursor.execute('''
                CREATE TABLE IF NOT EXISTS token_tables (
                    table_name TEXT PRIMARY KEY,
                    token_address TEXT NOT NULL,
                    token_name TEXT,
                    created_at TEXT NOT NULL
                )''')
                
                db.commit()
                print(f"Verified database tables exist in {self.folder_name}")
        except sqlite3.Error as e:
            print(f"Database error during table verification: {str(e)}")
            raise

    def create_token_specific_table(self, db, token_address: str, token_name: str, token_table_name: str):
        """Create a token-specific table if it doesn't exist"""
        try:
            cursor = db.cursor()
            
            # First check if table already exists
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (token_table_name,))
            if cursor.fetchone() is None:
                # Create the token-specific table with the same schema as scan_records
                cursor.execute(f"""
                CREATE TABLE IF NOT EXISTS {token_table_name} (
                    token_address TEXT,
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
                )""")
                
                # Record the table creation
                cursor.execute('''
                    INSERT INTO token_tables (table_name, token_address, token_name, created_at)
                    VALUES (?, ?, ?, ?)
                ''', (token_table_name, token_address, token_name, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
                
                db.commit()
                return True
            return False
        except sqlite3.Error as e:
            print(f"Error creating token-specific table: {str(e)}")
            return False

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

    async def check_token_conditions(self, token_address: str, token_age_hours: float, liquidity: float) -> bool:
        """Check if token meets removal conditions"""
        if (token_age_hours > TOKEN_KICK_CONDITIONS['MAX_AGE_HOURS'] and
            liquidity < TOKEN_KICK_CONDITIONS['MIN_LIQUIDITY']):
            return True
        return False

    async def move_token_to_removed(self, db_path: str, token_address: str, reason: str):
        """Move token to REMOVED table"""
        with sqlite3.connect(db_path) as db:
            cursor = db.cursor()
            
            # Get token data from scan_records
            cursor.execute('''
                SELECT * FROM scan_records WHERE token_address = ?
            ''', (token_address,))
            token_data = cursor.fetchone()
            
            if token_data:
                # Insert into xHoneypot_removed
                cursor.execute('''
                    INSERT INTO xHoneypot_removed (
                        token_address,
                        removal_timestamp,
                        original_scan_timestamp,
                        token_name,
                        token_symbol,
                        token_decimals,
                        token_total_supply,
                        token_pair_address,
                        token_age_hours,
                        hp_simulation_success,
                        hp_buy_tax,
                        hp_sell_tax,
                        hp_transfer_tax,
                        hp_liquidity_amount,
                        hp_pair_reserves0,
                        hp_pair_reserves1,
                        hp_buy_gas_used,
                        hp_sell_gas_used,
                        hp_creation_time,
                        hp_holder_count,
                        hp_is_honeypot,
                        hp_honeypot_reason,
                        total_scans,
                        honeypot_failures,
                        last_error,
                        removal_reason
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    token_data[0],  # token_address
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),  # removal_timestamp
                    token_data[1],  # original_scan_timestamp
                    token_data[3],  # token_name
                    token_data[4],  # token_symbol
                    token_data[5],  # token_decimals
                    token_data[6],  # token_total_supply
                    token_data[2],  # token_pair_address
                    token_data[7],  # token_age_hours
                    token_data[8],  # hp_simulation_success
                    token_data[9],  # hp_buy_tax
                    token_data[10], # hp_sell_tax
                    token_data[11], # hp_transfer_tax
                    token_data[12], # hp_liquidity_amount
                    token_data[13], # hp_pair_reserves0
                    token_data[14], # hp_pair_reserves1
                    token_data[15], # hp_buy_gas_used
                    token_data[16], # hp_sell_gas_used
                    token_data[17], # hp_creation_time
                    token_data[18], # hp_holder_count
                    token_data[19], # hp_is_honeypot
                    token_data[20], # hp_honeypot_reason
                    token_data[21], # total_scans
                    token_data[22], # honeypot_failures
                    token_data[23], # last_error
                    reason
                ))
                
                # Delete from scan_records
                cursor.execute('DELETE FROM scan_records WHERE token_address = ?', (token_address,))
                db.commit()

    async def process_token(self, token_address: str, pair_address: str):
        """Process a token by checking its honeypot status and other data"""
        # Define db_path at start to ensure availability in error handlers
        db_path = os.path.join(self.folder_name, 'scan_records.db')
        error_message = None
        
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
                    error_message = f"Honeypot API error: {str(honeypot_data)}"
                    log_message(error_message, "ERROR")
                    honeypot_data = {}
                
                if isinstance(goplus_data, Exception):
                    error_message = f"GoPlus API error: {str(goplus_data)}"
                    log_message(error_message, "ERROR")
                    goplus_data = {}

            except asyncio.TimeoutError:
                error_message = "API calls timed out"
                log_message(error_message, "ERROR")
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
            
            # Display security data in a nice table
            if goplus_data and 'result' in goplus_data:
                token_data = goplus_data['result'].get(token_address.lower(), {})
                
                def safe_float(value, default=0.0):
                    """Safely convert value to float, handling empty strings"""
                    if not value or value == '':
                        return default
                    try:
                        return float(value)
                    except (ValueError, TypeError):
                        return default

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
                        "passed": safe_float(token_data.get('buy_tax', '100')) <= 10 and safe_float(token_data.get('sell_tax', '100')) <= 10,
                        "details": f"Buy Tax: {safe_float(token_data.get('buy_tax', '0')) * 100:.2f}%\nSell Tax: {safe_float(token_data.get('sell_tax', '0')) * 100:.2f}%"
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
                            if token_data.get('dex') else ["No liquidity data available"]
                        )
                    }
                }
                
                # Print the security analysis table
                print("\nGoPlus Security Analysis:")
                print("=" * 50)
                console.print(create_security_table(security_data))
            else:
                log_message("Invalid or missing GoPlus data format", "WARNING")
                print("\nGoPlus Debug Info:")
                print("=" * 50)
                print(f"Response is dict: {isinstance(goplus_data, dict)}")
                print(f"Response has 'result' key: {'result' in goplus_data if isinstance(goplus_data, dict) else False}")
                print(f"Raw response: {json.dumps(goplus_data, indent=2)}")

            # Calculate token age
            token_age_hours = None
            creation_time_str = honeypot_data.get('pair', {}).get('createdAtTimestamp')
            if creation_time_str:
                try:
                    if str(creation_time_str).isdigit():
                        creation_time = datetime.fromtimestamp(int(creation_time_str))
                        token_age_hours = float((datetime.now() - creation_time).total_seconds() / 3600)
                    else:
                        creation_time = datetime.strptime(creation_time_str, '%Y-%m-%d %H:%M:%S')
                        token_age_hours = float((datetime.now() - creation_time).total_seconds() / 3600)
                except (ValueError, TypeError):
                    token_age_hours = None

            # Get current scan count and create token-specific table
            with sqlite3.connect(db_path) as db:
                cursor = db.cursor()
                
                # Create token-specific table first
                token_name_safe = ''.join(c for c in token_info.get('name', 'Unknown') if c.isalnum())
                token_table_name = f"{token_name_safe}_{token_address.lower()}"
                self.create_token_specific_table(db, token_address, token_info.get('name', 'Unknown'), token_table_name)

                # Rest of the database operations...
                cursor.execute('SELECT total_scans, honeypot_failures FROM scan_records WHERE token_address = ?', 
                            (token_address,))
                result = cursor.fetchone()
                total_scans = (result[0] + 1) if result else 1
                honeypot_failures = result[1] if result else 0

                # Extract all data components
                token_info = honeypot_data.get('token', {})
                simulation = honeypot_data.get('simulationResult', {})
                contract = honeypot_data.get('contractCode', {})
                pair_info = honeypot_data.get('pair', {})
                pair_details = pair_info.get('pair', {})
                honeypot_result = honeypot_data.get('honeypotResult', {})

                # Prepare Honeypot values
                honeypot_values = [
                    token_address,
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    pair_address,
                    token_info.get('name', 'Unknown'),
                    token_info.get('symbol', 'Unknown'),
                    token_info.get('decimals', 18),
                    token_info.get('totalSupply', '0'),
                    token_age_hours,
                    bool(honeypot_data.get('simulationSuccess', False)),
                    float(simulation.get('buyTax', 0)),
                    float(simulation.get('sellTax', 0)),
                    float(simulation.get('transferTax', 0)),
                    float(pair_info.get('liquidity', 0)),
                    str(pair_info.get('reserves0', '')),
                    str(pair_info.get('reserves1', '')),
                    int(simulation.get('buyGas', 0)),
                    int(simulation.get('sellGas', 0)),
                    pair_info.get('createdAtTimestamp', ''),
                    int(token_info.get('totalHolders', 0)),
                    bool(honeypot_result.get('isHoneypot', True)),
                    honeypot_result.get('honeypotReason', ''),
                    bool(contract.get('openSource', False)),
                    bool(contract.get('isProxy', False)),
                    bool(contract.get('isMintable', False)),
                    bool(contract.get('canBeMinted', False)),
                    token_info.get('owner', ''),
                    token_info.get('creator', ''),
                    token_info.get('deployer', ''),
                    bool(contract.get('hasProxyCalls', False)),
                    float(pair_info.get('liquidity', 0)),
                    float(pair_info.get('liquidityToken0', 0)),
                    float(pair_info.get('liquidityToken1', 0)),
                    pair_details.get('token0Symbol', ''),
                    pair_details.get('token1Symbol', ''),
                    json.dumps(honeypot_data.get('flags', []))
                ]

                # Use the prepare_goplus_values helper function to get GoPlus values
                goplus_values = list(prepare_goplus_values(self, goplus_data, token_address))

                # Get existing liquidity values first
                cursor.execute("""
                    SELECT liq10, liq20, liq30, liq40, liq50, liq60, liq70, liq80, liq90, liq100,
                           liq110, liq120, liq130, liq140, liq150, liq160, liq170, liq180, liq190, liq200 
                    FROM scan_records 
                    WHERE token_address = ?""", (token_address,))
                
                previous_values = cursor.fetchone() or [None] * 20

                # Prepare liquidity tracking values
                liquidity_values = []
                current_liquidity = float(pair_info.get('liquidity', 0))
                multiplier = getattr(self.config, 'liquidity_multiplier', 1)

                # Calculate which liquidity field should be updated (if any)
                update_field = None
                if total_scans % multiplier == 0:  # Only update on multiples of multiplier
                    update_field = total_scans  # This will be the field number to update (e.g., 10, 20, 30, etc.)

                for i, field_num in enumerate(range(10, 201, 10)):
                    if update_field and field_num == update_field:
                        # Update this field with current liquidity
                        liquidity_values.append(current_liquidity)
                    else:
                        # Keep previous value if it exists
                        liquidity_values.append(previous_values[i] if previous_values else None)

                # Add liquidity values to values list
                values = honeypot_values + goplus_values + [total_scans, honeypot_failures, '', 'active'] + liquidity_values

                # Create token-specific table if it doesn't exist
                token_name_safe = ''.join(c for c in token_info.get('name', 'Unknown') if c.isalnum())
                token_table_name = f"{token_name_safe}_{token_address.lower()}"
                
                # Create token-specific table
                cursor.execute(f"""
                    CREATE TABLE IF NOT EXISTS {token_table_name} (
                        token_address TEXT,
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
                    )
                """)
                
                # Single INSERT OR REPLACE operation for main table
                columns = [
                    "token_address", "scan_timestamp", "pair_address", "token_name", "token_symbol",
                    "token_decimals", "token_total_supply", "token_age_hours",
                    "hp_simulation_success", "hp_buy_tax", "hp_sell_tax", "hp_transfer_tax",
                    "hp_liquidity_amount", "hp_pair_reserves0", "hp_pair_reserves1",
                    "hp_buy_gas_used", "hp_sell_gas_used", "hp_creation_time",
                    "hp_holder_count", "hp_is_honeypot", "hp_honeypot_reason",
                    "hp_is_open_source", "hp_is_proxy", "hp_is_mintable", "hp_can_be_minted",
                    "hp_owner_address", "hp_creator_address", "hp_deployer_address",
                    "hp_has_proxy_calls", "hp_pair_liquidity", "hp_pair_liquidity_token0",
                    "hp_pair_liquidity_token1", "hp_pair_token0_symbol", "hp_pair_token1_symbol",
                    "hp_flags",
                    # GoPlus columns
                    "gp_is_open_source", "gp_is_proxy", "gp_is_mintable",
                    "gp_owner_address", "gp_creator_address", "gp_can_take_back_ownership",
                    "gp_owner_change_balance", "gp_hidden_owner", "gp_selfdestruct",
                    "gp_external_call", "gp_buy_tax", "gp_sell_tax", "gp_is_anti_whale",
                    "gp_anti_whale_modifiable", "gp_cannot_buy", "gp_cannot_sell_all",
                    "gp_slippage_modifiable", "gp_personal_slippage_modifiable",
                    "gp_trading_cooldown", "gp_is_blacklisted", "gp_is_whitelisted",
                    "gp_is_in_dex", "gp_transfer_pausable", "gp_can_be_minted",
                    "gp_total_supply", "gp_holder_count", "gp_owner_percent",
                    "gp_owner_balance", "gp_creator_percent", "gp_creator_balance",
                    "gp_lp_holder_count", "gp_lp_total_supply", "gp_is_true_token",
                    "gp_is_airdrop_scam", "gp_trust_list", "gp_other_potential_risks",
                    "gp_note", "gp_honeypot_with_same_creator", "gp_fake_token",
                    "gp_holders", "gp_lp_holders", "gp_dex_info",
                    # Metadata columns
                    "total_scans", "honeypot_failures", "last_error", "status",
                    "liq10", "liq20", "liq30", "liq40", "liq50", "liq60", "liq70", "liq80", "liq90", "liq100",
                    "liq110", "liq120", "liq130", "liq140", "liq150", "liq160", "liq170", "liq180", "liq190", "liq200"
                ]
                placeholders = ", ".join(["?" for _ in range(len(columns))])
                
                # Insert into main table
                cursor.execute(f"""
                    INSERT OR REPLACE INTO scan_records ({", ".join(columns)})
                    VALUES ({placeholders})
                """, values)
                
                # Insert into token-specific table
                cursor.execute(f"""
                    INSERT OR REPLACE INTO {token_table_name} ({", ".join(columns)})
                    VALUES ({placeholders})
                """, values)
                
                db.commit()

            # Check if token should be moved to HONEYPOTS table
            is_honeypot = bool(honeypot_result.get('isHoneypot', True))
            if token_age_hours is not None:
                await self.check_and_move_honeypot(token_address, token_age_hours, is_honeypot)

            # Print API stats after processing
            print("\nAPI Call Statistics:")
            print("=" * 50)
            
            # Create statistics table with empty responses
            stats_table = Table(title="API Call Statistics", border_style="blue")
            stats_table.add_column("Endpoint", style="cyan")
            stats_table.add_column("Total Calls", style="green")
            stats_table.add_column("Success", style="green")
            stats_table.add_column("Empty Responses", style="yellow")
            stats_table.add_column("Errors", style="red")
            stats_table.add_column("Rate Limits", style="magenta")
            
            # Initialize empty response counters
            empty_responses = {
                'goplus': 0,
                'honeypot': 0
            }
            
            # Check for empty responses
            if not goplus_data or not isinstance(goplus_data, dict) or not goplus_data.get('result'):
                empty_responses['goplus'] = 1
            if not honeypot_data or not isinstance(honeypot_data, dict) or not honeypot_data.get('simulationSuccess'):
                empty_responses['honeypot'] = 1
            
            # Get stats from api_tracker
            for endpoint, stats in api_tracker.calls_by_endpoint.items():
                # Update empty response count
                stats["empty_response_count"] = empty_responses.get(endpoint, 0)
                
                stats_table.add_row(
                    endpoint,
                    str(stats["total_calls"]),
                    str(stats["success_count"]),
                    str(stats["empty_response_count"]),
                    str(stats["error_count"]),
                    str(stats["rate_limit_count"])
                )
            
            console.print(stats_table)

            return True

        except Exception as e:
            error_message = str(e)
            if db_path:
                try:
                    with sqlite3.connect(db_path) as error_db:
                        error_cursor = error_db.cursor()
                        error_cursor.execute('''
                            UPDATE scan_records 
                            SET honeypot_failures = honeypot_failures + 1,
                                last_error = ?
                            WHERE token_address = ?
                        ''', (error_message, token_address))

                        # Get honeypot failure limit from config
                        honeypot_failure_limit = 5  # Default value
                        if hasattr(self.tracker, 'config') and isinstance(self.tracker.config, dict):
                            honeypot_failure_limit = self.tracker.config.get('scanning', {}).get('honeypot_failure_limit', 5)
                        elif hasattr(self.tracker, 'config') and hasattr(self.tracker.config, 'scanning'):
                            honeypot_failure_limit = getattr(self.tracker.config.scanning, 'honeypot_failure_limit', 5)

                        # Check if token should be moved to xHoneypot_removed
                        error_cursor.execute('''
                            SELECT 
                                token_address,
                                scan_timestamp,
                                token_name,
                                token_symbol,
                                token_decimals,
                                token_total_supply,
                                pair_address,
                                token_age_hours,
                                hp_simulation_success,
                                hp_buy_tax,
                                hp_sell_tax,
                                hp_transfer_tax,
                                hp_liquidity_amount,
                                hp_pair_reserves0,
                                hp_pair_reserves1,
                                hp_buy_gas_used,
                                hp_sell_gas_used,
                                hp_creation_time,
                                hp_holder_count,
                                hp_is_honeypot,
                                hp_honeypot_reason,
                                total_scans,
                                honeypot_failures,
                                last_error
                            FROM scan_records 
                            WHERE token_address = ? 
                            AND honeypot_failures >= ?
                            AND hp_is_honeypot = 1
                        ''', (token_address, honeypot_failure_limit))
                        
                        failed_token = error_cursor.fetchone()
                        if failed_token:
                            # Insert into xHoneypot_removed
                            error_cursor.execute('''
                                INSERT INTO xHoneypot_removed (
                                    token_address,
                                    removal_timestamp,
                                    original_scan_timestamp,
                                    token_name,
                                    token_symbol,
                                    token_decimals,
                                    token_total_supply,
                                    token_pair_address,
                                    token_age_hours,
                                    hp_simulation_success,
                                    hp_buy_tax,
                                    hp_sell_tax,
                                    hp_transfer_tax,
                                    hp_liquidity_amount,
                                    hp_pair_reserves0,
                                    hp_pair_reserves1,
                                    hp_buy_gas_used,
                                    hp_sell_gas_used,
                                    hp_creation_time,
                                    hp_holder_count,
                                    hp_is_honeypot,
                                    hp_honeypot_reason,
                                    total_scans,
                                    honeypot_failures,
                                    last_error,
                                    removal_reason
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                failed_token[0],  # token_address
                                datetime.now().strftime('%Y-%m-%d %H:%M:%S'),  # removal_timestamp
                                failed_token[1],  # original_scan_timestamp
                                failed_token[2],  # token_name
                                failed_token[3],  # token_symbol
                                failed_token[4],  # token_decimals
                                failed_token[5],  # token_total_supply
                                failed_token[6],  # token_pair_address
                                failed_token[7],  # token_age_hours
                                failed_token[8],  # hp_simulation_success
                                failed_token[9],  # hp_buy_tax
                                failed_token[10], # hp_sell_tax
                                failed_token[11], # hp_transfer_tax
                                failed_token[12], # hp_liquidity_amount
                                failed_token[13], # hp_pair_reserves0
                                failed_token[14], # hp_pair_reserves1
                                failed_token[15], # hp_buy_gas_used
                                failed_token[16], # hp_sell_gas_used
                                failed_token[17], # hp_creation_time
                                failed_token[18], # hp_holder_count
                                failed_token[19], # hp_is_honeypot
                                failed_token[20], # hp_honeypot_reason
                                failed_token[21], # total_scans
                                failed_token[22], # honeypot_failures
                                failed_token[23], # last_error
                                f"Exceeded honeypot failure limit ({honeypot_failure_limit})"
                            ))

                            # Delete from scan_records
                            error_cursor.execute('DELETE FROM scan_records WHERE token_address = ?', (token_address,))

                        error_db.commit()
                except sqlite3.Error as db_error:
                    log_message(f"Failed to update error status in database: {str(db_error)}", "ERROR")
                except Exception as unexpected_error:
                    log_message(f"Unexpected error updating error status: {str(unexpected_error)}", "ERROR")
            
            log_message(f"Error processing token {token_address}: {error_message}", "ERROR")
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
                    WHERE status = 'active'
                    ORDER BY scan_timestamp ASC
                ''')
                
                tokens = cursor.fetchall()
                print(f"Found {len(tokens)} tokens eligible for rescan")
                
                if tokens:
                    # First process all tokens
                    for token_address, pair_address, total_scans, scan_timestamp in tokens:
                        print(f"\nRescanning token {token_address}")
                        print(f"Current scan count: {total_scans}")
                        print(f"Last scan time: {scan_timestamp}")
                        await self.process_token(token_address, pair_address)
                        await asyncio.sleep(5)  # Increased delay between rescans

                    # After all processing and API stats are shown, display the rescan queue
                    print("\nRescan Queue:")
                    print("=" * 50)
                    rescan_table = Table(title="[bold yellow]RESCAN QUEUE", border_style="yellow")
                    rescan_table.add_column("Token Address", style="cyan")
                    rescan_table.add_column("Token Name", style="green")
                    rescan_table.add_column("Pair Address", style="magenta")
                    rescan_table.add_column("GoPlus Liquidity", style="blue")
                    rescan_table.add_column("Honeypot Liquidity", style="red")
                    rescan_table.add_column("Scan #", style="yellow")
                    rescan_table.add_column("Last Scan", style="white")
                    
                    # Refresh token data after processing
                    cursor.execute('''
                        SELECT token_address, pair_address, total_scans, scan_timestamp
                        FROM scan_records 
                        WHERE status = 'active'
                        ORDER BY scan_timestamp ASC
                    ''')
                    updated_tokens = cursor.fetchall()
                    
                    for token_address, pair_address, total_scans, scan_timestamp in updated_tokens:
                        # Get token info from database
                        cursor.execute('''
                            SELECT token_name, hp_liquidity_amount, gp_dex_info 
                            FROM scan_records 
                            WHERE token_address = ?
                        ''', (token_address,))
                        db_data = cursor.fetchone()
                        
                        token_name = db_data[0] if db_data and db_data[0] else "Unknown"
                        honeypot_liquidity = f"${float(db_data[1]):,.2f}" if db_data and db_data[1] else "N/A"
                        
                        # Parse GoPlus DEX info to get liquidity
                        goplus_liquidity = "N/A"
                        if db_data and db_data[2]:
                            try:
                                dex_info = json.loads(db_data[2])
                                if dex_info and isinstance(dex_info, list):
                                    # Sum up liquidity from all DEXes and multiply by 2
                                    total_liquidity = sum(float(dex.get('liquidity', 0)) for dex in dex_info) * 2
                                    goplus_liquidity = f"${total_liquidity:,.2f}"
                            except (json.JSONDecodeError, ValueError):
                                goplus_liquidity = "N/A"
                        
                        rescan_table.add_row(
                            token_address,
                            token_name,
                            pair_address,
                            goplus_liquidity,
                            honeypot_liquidity,
                            str(total_scans + 1),
                            scan_timestamp
                        )
                    
                    console.print(rescan_table)
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
        rescan_interval = 60  # 1 minute
        
        if not self.event_filter:
            print("Error: Event filter not initialized")
            return
        
        # Create combined table container
        combined_table = Table(show_header=False, border_style="bold white")
        
        # Create and add config table
        config_table = Table(show_header=False, border_style="bold white", width=40)
        config_table.add_column("Setting", style="cyan")
        config_table.add_column("Value", style="green")
        config_table.add_row("Check Interval", f"{check_interval} seconds")
        config_table.add_row("Rescan Interval", f"{rescan_interval} seconds")
        config_table.add_row("Max Rescans", str(self.config['scanning']['max_rescan_count']))
        config_table.add_row("Honeypot Failure Limit", str(self.config['scanning']['honeypot_failure_limit']))
        
        # Create and add block table
        block_table = Table(show_header=False, border_style="bold white", width=40)
        block_table.add_column("Field", style="cyan")
        block_table.add_column("Value", style="green")
        
        current_block = await self.tracker.web3.eth.block_number
        start_block = max(current_block - 1000, 0)  # Look back 1000 blocks
        
        block_table.add_row("Current Block", str(current_block))
        block_table.add_row("Start Block", str(start_block))
        
        # Add both tables to combined container
        combined_table.add_row(config_table, block_table)
        console.print(combined_table)
        
        try:
            # Process last few pairs before starting live monitoring
            hours = float(input("\nEnter number of hours to scan back (e.g. 1): "))
            print(f"\nScanning back {hours} hours...")
            
            # Calculate blocks to look back based on average block time (13 seconds for Ethereum)
            blocks_per_hour = int(3600 / 13)  # ~277 blocks per hour
            blocks_to_scan = int(blocks_per_hour * hours)
            
            current_block = await self.tracker.web3.eth.block_number
            start_block = max(current_block - blocks_to_scan, 0)
            
            print(f"Current block: {current_block}")
            print(f"Start block: {start_block}")
            print(f"Scanning {blocks_to_scan} blocks...")
            
            # Setup event filter for historical range
            self.event_filter = await self.tracker.factory_contract.events.PairCreated.create_filter(
                fromBlock=start_block,
                toBlock=current_block
            )
            
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
            
            # Process all WETH pairs found
            print(f"\nFound {len(weth_pairs)} WETH pairs in the last {hours} hours")
            
            for i, (token_address, pair_address) in enumerate(weth_pairs, 1):
                print(f"\n{'='*80}")
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processing Historical Pair {i}/{len(weth_pairs)}")
                print(f"Token: {token_address}")
                print(f"Pair: {pair_address}")
                print(f"{'='*80}\n")
                
                try:
                    await self.process_token_safe(token_address, pair_address)
                except Exception as e:
                    print(f"Error processing historical token {token_address}: {str(e)}")
                    continue
                
                # Add delay spinner between historical pairs
                await self.delay_with_spinner(10, "Waiting before next historical pair")
            
            print("\nStarting live monitoring...")
            
            # Reset event filter for live monitoring
            self.event_filter = await self.tracker.factory_contract.events.PairCreated.create_filter(fromBlock='latest')
            
            while self.running:
                current_time = datetime.now()
                
                # Process rescans on interval
                if (current_time - last_rescan_time).total_seconds() >= rescan_interval:
                    print("\n") # Clear line before rescan output
                    try:
                        await self.checker.process_rescan_tokens()
                    except Exception as e:
                        print(f"Error during rescan: {str(e)}")
                    last_rescan_time = current_time
                    print("\nResuming monitoring...")
                
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
                            # Calculate time until next rescan
                            time_since_last_rescan = (current_time - last_rescan_time).total_seconds()
                            time_until_next_rescan = max(0, rescan_interval - time_since_last_rescan)
                            minutes = int(time_until_next_rescan // 60)
                            seconds = int(time_until_next_rescan % 60)
                            
                            # Update spinner with both monitoring status and rescan countdown
                            print(f"\r{self.get_next_spinner()} Monitoring for new pairs... (Next rescan in {minutes:02d}:{seconds:02d}) ", end="", flush=True)
                            
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

    async def check_and_move_honeypot(self, token_address: str, token_age_hours: float, is_honeypot: bool):
        """Check if token meets honeypot criteria and move it if necessary"""
        if token_age_hours > 1.0 and is_honeypot:
            db_path = os.path.join(self.folder_name, 'scan_records.db')
            try:
                with sqlite3.connect(db_path) as db:
                    cursor = db.cursor()
                    
                    # Get token data
                    cursor.execute('''
                        SELECT 
                            scan_timestamp,
                            token_name,
                            token_symbol,
                            token_decimals,
                            token_total_supply,
                            pair_address,
                            token_age_hours,
                            hp_simulation_success,
                            hp_buy_tax,
                            hp_sell_tax,
                            hp_transfer_tax,
                            hp_liquidity_amount,
                            hp_pair_reserves0,
                            hp_pair_reserves1,
                            hp_buy_gas_used,
                            hp_sell_gas_used,
                            hp_creation_time,
                            hp_holder_count,
                            hp_is_honeypot,
                            hp_honeypot_reason,
                            total_scans,
                            honeypot_failures,
                            last_error
                        FROM scan_records 
                        WHERE token_address = ?
                    ''', (token_address,))
                    
                    token_data = cursor.fetchone()
                    if token_data:
                        # Insert into HONEYPOTS table
                        cursor.execute('''
                            INSERT INTO HONEYPOTS (
                                token_address,
                                removal_timestamp,
                                original_scan_timestamp,
                                token_name,
                                token_symbol,
                                token_decimals,
                                token_total_supply,
                                token_pair_address,
                                token_age_hours,
                                hp_simulation_success,
                                hp_buy_tax,
                                hp_sell_tax,
                                hp_transfer_tax,
                                hp_liquidity_amount,
                                hp_pair_reserves0,
                                hp_pair_reserves1,
                                hp_buy_gas_used,
                                hp_sell_gas_used,
                                hp_creation_time,
                                hp_holder_count,
                                hp_is_honeypot,
                                hp_honeypot_reason,
                                total_scans,
                                honeypot_failures,
                                last_error,
                                removal_reason
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (
                            token_address,
                            datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                            token_data[0],  # original_scan_timestamp
                            token_data[1],  # token_name
                            token_data[2],  # token_symbol
                            token_data[3],  # token_decimals
                            token_data[4],  # token_total_supply
                            token_data[5],  # pair_address
                            token_data[6],  # token_age_hours
                            token_data[7],  # hp_simulation_success
                            token_data[8],  # hp_buy_tax
                            token_data[9],  # hp_sell_tax
                            token_data[10], # hp_transfer_tax
                            token_data[11], # hp_liquidity_amount
                            token_data[12], # hp_pair_reserves0
                            token_data[13], # hp_pair_reserves1
                            token_data[14], # hp_buy_gas_used
                            token_data[15], # hp_sell_gas_used
                            token_data[16], # hp_creation_time
                            token_data[17], # hp_holder_count
                            token_data[18], # hp_is_honeypot
                            token_data[19], # hp_honeypot_reason
                            token_data[20], # total_scans
                            token_data[21], # honeypot_failures
                            token_data[22], # last_error
                            "Token age > 1hr and confirmed honeypot"
                        ))
                        
                        # Delete from scan_records
                        cursor.execute('DELETE FROM scan_records WHERE token_address = ?', (token_address,))
                        db.commit()
                        
                        print(f"\nMoved token {token_address} to HONEYPOTS table (Age: {token_age_hours:.2f} hours)")
                        return True
            except sqlite3.Error as e:
                print(f"Database error moving honeypot: {str(e)}")
            except Exception as e:
                print(f"Error moving honeypot: {str(e)}")
        return False


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
    # Look for any session folders, not just today's
    session_folders = [d for d in os.listdir() if ' - Session ' in d]
    if not session_folders:
        return 1
    
    # Extract session numbers from all folders
    session_nums = []
    for folder in session_folders:
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
        
        # Create combined table container
        combined_table = Table(show_header=False, border_style="bold white")
        
        # Create and add config table
        config_table = Table(show_header=False, border_style="bold white", width=40)
        config_table.add_column("Setting", style="cyan")
        config_table.add_column("Value", style="green")
        config_table.add_row("Check Interval", f"{check_interval} seconds")
        config_table.add_row("Rescan Interval", f"{rescan_interval} seconds")
        config_table.add_row("Max Rescans", str(self.config['scanning']['max_rescan_count']))
        config_table.add_row("Honeypot Failure Limit", str(self.config['scanning']['honeypot_failure_limit']))
        
        # Create and add block table
        block_table = Table(show_header=False, border_style="bold white", width=40)
        block_table.add_column("Field", style="cyan")
        block_table.add_column("Value", style="green")
        
        current_block = await self.tracker.web3.eth.block_number
        start_block = max(current_block - 1000, 0)  # Look back 1000 blocks
        
        block_table.add_row("Current Block", str(current_block))
        block_table.add_row("Start Block", str(start_block))
        
        # Add both tables to combined container
        combined_table.add_row(config_table, block_table)
        console.print(combined_table)
        
        try:
            # Process last few pairs before starting live monitoring
            hours = float(input("\nEnter number of hours to scan back (e.g. 1): "))
            print(f"\nScanning back {hours} hours...")
            
            # Calculate blocks to look back based on average block time (13 seconds for Ethereum)
            blocks_per_hour = int(3600 / 13)  # ~277 blocks per hour
            blocks_to_scan = int(blocks_per_hour * hours)
            
            current_block = await self.tracker.web3.eth.block_number
            start_block = max(current_block - blocks_to_scan, 0)
            
            print(f"Current block: {current_block}")
            print(f"Start block: {start_block}")
            print(f"Scanning {blocks_to_scan} blocks...")
            
            # Setup event filter for historical range
            self.event_filter = await self.tracker.factory_contract.events.PairCreated.create_filter(
                fromBlock=start_block,
                toBlock=current_block
            )
            
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
            
            # Process all WETH pairs found
            print(f"\nFound {len(weth_pairs)} WETH pairs in the last {hours} hours")
            
            for i, (token_address, pair_address) in enumerate(weth_pairs, 1):
                print(f"\n{'='*80}")
                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Processing Historical Pair {i}/{len(weth_pairs)}")
                print(f"Token: {token_address}")
                print(f"Pair: {pair_address}")
                print(f"{'='*80}\n")
                
                try:
                    await self.process_token_safe(token_address, pair_address)
                except Exception as e:
                    print(f"Error processing historical token {token_address}: {str(e)}")
                    continue
                
                # Add delay spinner between historical pairs
                await self.delay_with_spinner(10, "Waiting before next historical pair")
            
            print("\nStarting live monitoring...")
            
            # Reset event filter for live monitoring
            self.event_filter = await self.tracker.factory_contract.events.PairCreated.create_filter(fromBlock='latest')
            
            while self.running:
                current_time = datetime.now()
                
                # Process rescans on interval
                if (current_time - last_rescan_time).total_seconds() >= rescan_interval:
                    print("\n") # Clear line before rescan output
                    try:
                        await self.checker.process_rescan_tokens()
                    except Exception as e:
                        print(f"Error during rescan: {str(e)}")
                    last_rescan_time = current_time
                    print("\nResuming monitoring...")
                
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
                            # Calculate time until next rescan
                            time_since_last_rescan = (current_time - last_rescan_time).total_seconds()
                            time_until_next_rescan = max(0, rescan_interval - time_since_last_rescan)
                            minutes = int(time_until_next_rescan // 60)
                            seconds = int(time_until_next_rescan % 60)
                            
                            # Update spinner with both monitoring status and rescan countdown
                            print(f"\r{self.get_next_spinner()} Monitoring for new pairs... (Next rescan in {minutes:02d}:{seconds:02d}) ", end="", flush=True)
                            
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
        # Set the event loop policy for Windows
        if sys.platform == 'win32':
            asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        
        # Get current date
        current_date = datetime.now().strftime('%B %d')
        
        # List ALL existing sessions, not just today's
        existing_sessions = [d for d in os.listdir() if ' - Session ' in d]
        existing_sessions.sort(reverse=True)  # Sort newest first
        
        # Ask user about session choice
        print("\nNEW SESSION? [Y/n]", end=" ")
        choice = input() or "Y"  # Default to Y if user just hits enter
        
        if choice.upper() == "Y":
            # Create new session folder
            folder_name = f"{current_date} - Session {get_next_session_number()}"
            os.makedirs(folder_name, exist_ok=True)
        else:
            if not existing_sessions:
                print("No existing sessions found. Creating new session.")
                folder_name = f"{current_date} - Session {get_next_session_number()}"
                os.makedirs(folder_name, exist_ok=True)
            else:
                print("\nExisting sessions:")
                for i, session in enumerate(existing_sessions, 1):
                    print(f"{i}. {session}")
                
                while True:
                    try:
                        choice = int(input("\nSelect session number: "))
                        if 1 <= choice <= len(existing_sessions):
                            folder_name = existing_sessions[choice - 1]
                            break
                        print("Invalid selection. Please try again.")
                    except ValueError:
                        print("Please enter a valid number.")
        
        print(f"\nUsing session folder: {folder_name}")
        
        print("Initializing scanner...")
        main = TokenTrackerMain("config.json", folder_name)
        
        # Create and run new event loop
        async def run_main():
            await main.async_init()
            await main.main_loop()
        
        asyncio.run(run_main())
        
    except KeyboardInterrupt:
        print("\n\nShutting down gracefully...")
        if 'main' in locals():
            main.stop()
    except Exception as e:
        print("\nFatal error:", str(e))
        print("Full traceback:")
        traceback.print_exc()
