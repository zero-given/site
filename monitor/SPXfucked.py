import json
from web3 import AsyncWeb3, AsyncHTTPProvider
from dataclasses import dataclass
from typing import List, Optional
import logging
import time
import threading
from datetime import datetime, timedelta
import os
import sqlite3
from key_manager import InfuraKeyManager

@dataclass
class TokenTrackerConfig:
    infura_keys: List[str]
    key_rotation_interval: int
    key_swap_sleep_time: int
    node_rpc: str
    gas_limit: int
    gas_price: float
    pub_key: str
    private: str
    minimum_liquidity_tokens: int
    maximum_liquidity_tokens: int
    minimum_liquidity_dollars: int
    maximum_buy_tax: int
    maximum_sell_tax: int
    max_honeypot_failures: int
    buy_amount: float

class TokenTracker:
    def __init__(self, config_path: str):
        self.config = self.load_config(config_path)
        self.key_manager = InfuraKeyManager()
        self.key_manager.initialize(
            infura_keys=self.config.infura_keys,
            key_rotation_interval=self.config.key_rotation_interval,
            key_swap_sleep_time=self.config.key_swap_sleep_time
        )
        self.web3 = AsyncWeb3(AsyncHTTPProvider(self.key_manager.get_current_rpc_url()))
        self.setup_logging()
        self.load_abis()
        self.setup_contracts()
        
    def load_config(self, config_path: str) -> TokenTrackerConfig:
        """Load configuration from JSON file"""
        with open(config_path, 'r') as f:
            config_data = json.load(f)
            # Convert infura_keys to list if it's not already
            if not isinstance(config_data['infura_keys'], list):
                config_data['infura_keys'] = list(config_data['infura_keys'])
            
            return TokenTrackerConfig(
                infura_keys=config_data['infura_keys'],
                key_rotation_interval=int(config_data['key_rotation_interval']),
                key_swap_sleep_time=int(config_data['key_swap_sleep_time']),
                node_rpc=str(config_data['node_rpc']),
                gas_limit=int(config_data['gas_limit']),
                gas_price=float(config_data['gas_price']),
                pub_key=str(config_data['pub_key']),
                private=str(config_data['private']),
                minimum_liquidity_tokens=int(config_data['minimum_liquidity_tokens']),
                maximum_liquidity_tokens=int(config_data['maximum_liquidity_tokens']),
                minimum_liquidity_dollars=int(config_data['minimum_liquidity_dollars']),
                maximum_buy_tax=int(config_data['maximum_buy_tax']),
                maximum_sell_tax=int(config_data['maximum_sell_tax']),
                max_honeypot_failures=int(config_data['max_honeypot_failures']),
                buy_amount=float(config_data['buy_amount'])
            )

    def setup_logging(self):
        """Setup logging configuration"""
        logging.basicConfig(
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            level=logging.INFO
        )
        self.logger = logging.getLogger('TokenTracker')

    def load_abis(self):
        """Load contract ABIs"""
        with open('abis.json', 'r') as f:
            self.abis = json.load(f)
            self.uniswap_factory_abi = self.abis['uniswap_factory_abi']
            self.liquidity_pool_abi = self.abis['liquidity_pool_abi']
            self.token_contract_abi = self.abis['token_contract_abi']
            self.uniswap_router_abi = self.abis['uniswap_router_abi']

    def setup_contracts(self):
        """Setup smart contract interfaces"""
        self.uniswap_router_address = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
        self.uniswap_factory_address = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'
        self.weth_address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

        self.factory_contract = self.web3.eth.contract(
            address=self.uniswap_factory_address,
            abi=self.uniswap_factory_abi
        )
        
        self.router_contract = self.web3.eth.contract(
            address=self.uniswap_router_address,
            abi=self.uniswap_router_abi
        )

    def _get_current_rpc_url(self) -> str:
        """Get the current Infura RPC URL with the current key"""
        return self.key_manager.get_current_rpc_url()

    def rotate_key(self) -> None:
        """Rotate to the next Infura API key"""
        self.key_manager.rotate_key()
        self.web3 = AsyncWeb3(AsyncHTTPProvider(self._get_current_rpc_url()))

    def check_and_rotate_key(self) -> None:
        """Check if it's time to rotate the key and do so if needed"""
        self.key_manager.check_and_rotate_key()
        self.web3 = AsyncWeb3(AsyncHTTPProvider(self._get_current_rpc_url()))

    async def get_pair_info(self, token_address: str) -> Optional[dict]:
        """Get pair information for a token"""
        try:
            self.check_and_rotate_key()  # Check if we need to rotate keys
            pair_address = await self.factory_contract.functions.getPair(
                token_address,
                self.weth_address
            ).call()
            
            if pair_address == '0x0000000000000000000000000000000000000000':
                return None
                
            pair_contract = self.web3.eth.contract(
                address=pair_address,
                abi=self.liquidity_pool_abi
            )
            
            reserves = await pair_contract.functions.getReserves().call()
            
            return {
                'pair_address': pair_address,
                'reserves': reserves
            }
            
        except Exception as e:
            if "429" in str(e):  # If we hit rate limit, force rotate key
                self.rotate_key()
                return await self.get_pair_info(token_address)  # Retry with new key
            self.logger.error(f"Error getting pair info: {str(e)}")
            return None

    async def check_token_contract(self, token_address: str) -> Optional[dict]:
        """Check token contract information"""
        try:
            self.check_and_rotate_key()  # Check if we need to rotate keys
            token_contract = self.web3.eth.contract(
                address=token_address,
                abi=self.token_contract_abi
            )
            
            return {
                'name': await token_contract.functions.name().call(),
                'symbol': await token_contract.functions.symbol().call(),
                'decimals': await token_contract.functions.decimals().call(),
                'total_supply': await token_contract.functions.totalSupply().call()
            }
            
        except Exception as e:
            if "429" in str(e):  # If we hit rate limit, force rotate key
                self.rotate_key()
                return await self.check_token_contract(token_address)  # Retry with new key
            self.logger.error(f"Error checking token contract: {str(e)}")
            return None