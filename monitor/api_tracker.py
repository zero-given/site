import json
import time
from datetime import datetime
import os
import asyncio
from typing import Dict, Optional
from rich.console import Console
from rich.table import Table

console = Console()

class APITracker:
    def __init__(self, log_dir: str = "api_logs"):
        """Initialize API tracker with log directory"""
        self.log_dir = log_dir
        self.call_counter = 0
        self.calls_by_endpoint = {}
        self.lock = asyncio.Lock()
        self.ensure_log_dir()
        
        # Create new log file for this session
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.log_file = os.path.join(self.log_dir, f"api_calls_{self.session_id}.json")
        
        # Initialize log file with empty array
        with open(self.log_file, 'w') as f:
            json.dump([], f)
            
    def ensure_log_dir(self):
        """Ensure log directory exists"""
        if not os.path.exists(self.log_dir):
            os.makedirs(self.log_dir)
            
    async def log_api_call(self, 
                          endpoint: str,
                          method: str,
                          params: Dict,
                          response_code: int,
                          response_body: str,
                          error: Optional[str] = None) -> int:
        """
        Log an API call with details and return the call ID
        
        Args:
            endpoint: API endpoint called
            method: HTTP method used
            params: Parameters sent with the call
            response_code: HTTP response code
            response_body: Response body received
            error: Error message if any
            
        Returns:
            call_id: Unique ID for this API call
        """
        async with self.lock:
            self.call_counter += 1
            call_id = self.call_counter
            
            # Record call details
            call_details = {
                "id": call_id,
                "timestamp": datetime.now().isoformat(),
                "endpoint": endpoint,
                "method": method,
                "params": params,
                "response_code": response_code,
                "response_body": response_body,
                "error": error,
                "time_since_last_call": self.get_time_since_last_call(endpoint)
            }
            
            # Update endpoint stats
            if endpoint not in self.calls_by_endpoint:
                self.calls_by_endpoint[endpoint] = {
                    "total_calls": 0,
                    "last_call_time": None,
                    "success_count": 0,
                    "error_count": 0,
                    "rate_limit_count": 0,
                    "empty_response_count": 0
                }
            
            stats = self.calls_by_endpoint[endpoint]
            stats["total_calls"] += 1
            stats["last_call_time"] = time.time()
            
            # Initialize empty response tracking
            stats["empty_response_count"] = stats.get("empty_response_count", 0)
            
            if response_code == 200 and not error:
                # Check for empty or invalid response
                if (not response_body or 
                    response_body == '{}' or 
                    response_body == '[]' or
                    (isinstance(response_body, dict) and not response_body) or
                    (isinstance(response_body, dict) and 'result' not in response_body)):
                    stats["empty_response_count"] += 1
                else:
                    stats["success_count"] += 1
            elif response_code == 429 or "rate limit" in str(response_body).lower():
                stats["rate_limit_count"] += 1
            else:
                stats["error_count"] += 1
            
            # Append to log file
            try:
                with open(self.log_file, 'r') as f:
                    logs = json.load(f)
                logs.append(call_details)
                with open(self.log_file, 'w') as f:
                    json.dump(logs, f, indent=2)
            except Exception as e:
                console.print(f"[red]Error writing to log file: {str(e)}")
            
            return call_id
            
    def get_time_since_last_call(self, endpoint: str) -> Optional[float]:
        """Get time in seconds since last call to this endpoint"""
        if endpoint in self.calls_by_endpoint:
            last_call = self.calls_by_endpoint[endpoint]["last_call_time"]
            if last_call:
                return time.time() - last_call
        return None
        
    def print_stats(self):
        """Print current API call statistics"""
        # Create main statistics table
        main_table = Table(title="API Call Statistics", border_style="blue")
        main_table.add_column("Endpoint", style="cyan")
        main_table.add_column("Total Calls", style="green")
        main_table.add_column("Success", style="green")
        main_table.add_column("Empty Responses", style="yellow")
        main_table.add_column("Errors", style="red")
        main_table.add_column("Rate Limits", style="magenta")
        
        # Create detailed tables
        empty_table = Table(title="[bold yellow]Empty Responses", border_style="yellow")
        empty_table.add_column("Endpoint", style="cyan")
        empty_table.add_column("Count", style="yellow")
        empty_table.add_column("Last Call", style="white")
        
        # Track empty responses
        for endpoint, stats in self.calls_by_endpoint.items():
            # Get empty response count from logs
            empty_count = 0
            last_empty_time = None
            try:
                with open(self.log_file, 'r') as f:
                    logs = json.load(f)
                    for log in logs:
                        if log['endpoint'] == endpoint and log['response_code'] == 200 and not log['error'] and not log['response_body']:
                            empty_count += 1
                            last_empty_time = log['timestamp']
            except Exception as e:
                console.print(f"[red]Error reading logs: {str(e)}")
            
            # Add to main table
            main_table.add_row(
                endpoint,
                str(stats["total_calls"]),
                str(stats["success_count"]),
                str(empty_count),
                str(stats["error_count"]),
                str(stats["rate_limit_count"])
            )
            
            # Add to empty responses table if applicable
            if empty_count > 0:
                empty_table.add_row(
                    endpoint,
                    str(empty_count),
                    last_empty_time or "Unknown"
                )
        
        # Print tables
        console.print(main_table)
        if empty_table.row_count > 0:
            console.print(empty_table)
        
# Global instance
api_tracker = APITracker()
