import time
from datetime import datetime, timedelta
from typing import List
import logging

class InfuraKeyManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(InfuraKeyManager, cls).__new__(cls)
            cls._instance.initialized = False
        return cls._instance
    
    def __init__(self):
        if not self.initialized:
            self.current_key_index = 0
            self.last_key_rotation = datetime.now()
            self.infura_keys = []
            self.key_rotation_interval = 0
            self.key_swap_sleep_time = 0
            self.logger = logging.getLogger('InfuraKeyManager')
            self.initialized = True
    
    def initialize(self, *, infura_keys: List[str], key_rotation_interval: int, key_swap_sleep_time: int):
        """Initialize the key manager with configuration"""
        if isinstance(infura_keys, (list, tuple)):
            self.infura_keys = list(infura_keys)
        else:
            raise ValueError("infura_keys must be a list or tuple")
            
        self.key_rotation_interval = int(key_rotation_interval)
        self.key_swap_sleep_time = int(key_swap_sleep_time)
        self.logger.info("InfuraKeyManager initialized with %d keys", len(self.infura_keys))
    
    def get_current_key(self) -> str:
        """Get the current Infura key"""
        if not self.infura_keys:
            raise RuntimeError("No Infura keys available. Did you call initialize()?")
        return self.infura_keys[self.current_key_index]
    
    def get_current_rpc_url(self) -> str:
        """Get the current Infura RPC URL with the current key"""
        base_url = "https://mainnet.infura.io/v3/"
        return base_url + self.get_current_key()
    
    def rotate_key(self) -> None:
        """Rotate to the next Infura API key"""
        if not self.infura_keys:
            raise RuntimeError("No Infura keys available. Did you call initialize()?")
        self.current_key_index = (self.current_key_index + 1) % len(self.infura_keys)
        self.last_key_rotation = datetime.now()
        self.logger.info("Rotated to new Infura key index: %d", self.current_key_index)
        time.sleep(self.key_swap_sleep_time)
    
    def check_and_rotate_key(self) -> None:
        """Check if it's time to rotate the key and do so if needed"""
        if datetime.now() - self.last_key_rotation > timedelta(seconds=self.key_rotation_interval):
            self.rotate_key()
    
    def force_rotate_key(self) -> None:
        """Force key rotation, typically used after hitting rate limits"""
        self.rotate_key()
