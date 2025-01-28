import aiohttp
import json
from typing import Dict, Optional
import asyncio
from api_tracker import api_tracker
from rich.console import Console

console = Console()

class APIWrapper:
    def __init__(self):
        """Initialize API wrapper with default settings"""
        self.session = None
        
    async def ensure_session(self):
        """Ensure aiohttp session exists"""
        if not self.session:
            self.session = aiohttp.ClientSession()
            
    async def close(self):
        """Close the session if it exists"""
        if self.session:
            await self.session.close()
            self.session = None
            
    async def call_goplus_api(self, address: str, delay: float = 30.0) -> Dict:
        """
        Call GoPlus API with tracking and proper error handling
        
        Args:
            address: Token address to check
            delay: Delay before making the call
            
        Returns:
            API response data
        """
        await self.ensure_session()
        
        # Add initial delay
        await asyncio.sleep(delay)
        
        endpoint = "https://api.gopluslabs.io/api/v1/token_security/1"
        params = {"contract_addresses": address}
        
        try:
            async with self.session.get(endpoint, params=params) as response:
                response_text = await response.text()
                
                # Log the API call
                call_id = await api_tracker.log_api_call(
                    endpoint="goplus",
                    method="GET",
                    params=params,
                    response_code=response.status,
                    response_body=response_text
                )
                
                console.print(f"[cyan]GoPlus API Call ID: {call_id}")
                
                if response.status == 200:
                    data = json.loads(response_text)
                    if 'result' in data:
                        return data
                    else:
                        console.print(f"[yellow]GoPlus API response missing result data (Call ID: {call_id})")
                        return {}
                else:
                    console.print(f"[red]GoPlus API HTTP error {response.status} (Call ID: {call_id})")
                    return {}
                    
        except Exception as e:
            # Log error
            call_id = await api_tracker.log_api_call(
                endpoint="goplus",
                method="GET",
                params=params,
                response_code=500,
                response_body="",
                error=str(e)
            )
            console.print(f"[red]Error during GoPlus API call: {str(e)} (Call ID: {call_id})")
            return {}
            
    async def call_honeypot_api(self, address: str, delay: float = 10.0) -> Dict:
        """
        Call Honeypot API with tracking and proper error handling
        
        Args:
            address: Token address to check
            delay: Delay before making the call
            
        Returns:
            API response data
        """
        await self.ensure_session()
        
        # Add initial delay
        await asyncio.sleep(delay)
        
        endpoint = "https://api.honeypot.is/v2/IsHoneypot"
        params = {"address": address}
        
        try:
            async with self.session.get(endpoint, params=params) as response:
                response_text = await response.text()
                
                # Log the API call
                call_id = await api_tracker.log_api_call(
                    endpoint="honeypot",
                    method="GET",
                    params=params,
                    response_code=response.status,
                    response_body=response_text
                )
                
                console.print(f"[cyan]Honeypot API Call ID: {call_id}")
                
                if response.status == 200:
                    data = json.loads(response_text)
                    return data
                else:
                    console.print(f"[red]Honeypot API HTTP error {response.status} (Call ID: {call_id})")
                    return {}
                    
        except Exception as e:
            # Log error
            call_id = await api_tracker.log_api_call(
                endpoint="honeypot",
                method="GET",
                params=params,
                response_code=500,
                response_body="",
                error=str(e)
            )
            console.print(f"[red]Error during Honeypot API call: {str(e)} (Call ID: {call_id})")
            return {}

# Global instance
api_wrapper = APIWrapper() 