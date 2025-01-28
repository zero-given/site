from dataclasses import dataclass
from datetime import datetime, timedelta
import sqlite3
import json
import os
from typing import Optional, List, Dict, Any

@dataclass
class TokenData:
    address: str
    pair_address: str
    name: str
    symbol: str
    decimals: int
    total_supply: str
    age_hours: float
    holder_count: int

@dataclass
class ScanResult:
    token: TokenData
    honeypot_data: Dict[str, Any]
    goplus_data: Dict[str, Any]
    scan_timestamp: str
    total_scans: int
    honeypot_failures: int

class DatabaseManager:
    def __init__(self, folder_name: str):
        self.folder_name = folder_name
        self.scan_records_path = os.path.join(folder_name, 'SCAN_RECORDS.db')
        self.initialize_database()

    def initialize_database(self):
        """Initialize database with simplified schema"""
        if not os.path.exists(self.folder_name):
            os.makedirs(self.folder_name)

        with sqlite3.connect(self.scan_records_path) as db:
            cursor = db.cursor()
            cursor.execute('''
            CREATE TABLE IF NOT EXISTS scan_records (
                token_address TEXT PRIMARY KEY,
                scan_timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                total_scans INTEGER DEFAULT 0,
                honeypot_failures INTEGER DEFAULT 0,
                last_error TEXT,
                token_data TEXT,  -- JSON field for basic token data
                honeypot_data TEXT,  -- JSON field for honeypot analysis
                goplus_data TEXT  -- JSON field for GoPlus analysis
            )''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_scan_timestamp ON scan_records(scan_timestamp)')
            db.commit()

    def update_scan_record(self, result: ScanResult) -> None:
        """Update or insert a scan record with simplified data structure"""
        with sqlite3.connect(self.scan_records_path) as db:
            cursor = db.cursor()
            
            # Convert dataclasses to JSON for storage
            token_data = {
                'address': result.token.address,
                'pair_address': result.token.pair_address,
                'name': result.token.name,
                'symbol': result.token.symbol,
                'decimals': result.token.decimals,
                'total_supply': result.token.total_supply,
                'age_hours': result.token.age_hours,
                'holder_count': result.token.holder_count
            }

            cursor.execute('''
                INSERT OR REPLACE INTO scan_records 
                (token_address, scan_timestamp, total_scans, honeypot_failures, 
                token_data, honeypot_data, goplus_data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                result.token.address,
                result.scan_timestamp,
                result.total_scans,
                result.honeypot_failures,
                json.dumps(token_data),
                json.dumps(result.honeypot_data),
                json.dumps(result.goplus_data)
            ))

    def get_tokens_for_rescan(self, max_failures: int, max_scans: int, minutes_old: int = 1) -> List[Dict]:
        """Get tokens that need rescanning with simplified query"""
        try:
            with sqlite3.connect(self.scan_records_path) as db:
                cursor = db.cursor()
                cutoff_time = (datetime.now() - timedelta(minutes=minutes_old)).strftime('%Y-%m-%d %H:%M:%S')
                
                cursor.execute('''
                    SELECT 
                        token_address,
                        token_data,
                        total_scans,
                        honeypot_failures
                    FROM scan_records
                    WHERE 
                        honeypot_failures < ?
                        AND total_scans < ?
                        AND scan_timestamp <= ?
                    ORDER BY scan_timestamp DESC
                ''', (max_failures, max_scans, cutoff_time))
                
                tokens = []
                for row in cursor.fetchall():
                    token_data = json.loads(row[1])
                    tokens.append({
                        'address': row[0],
                        'pair': token_data['pair_address'],
                        'total_scans': row[2],
                        'failures': row[3]
                    })
                return tokens
                
        except sqlite3.Error as e:
            print(f"Error getting tokens for rescan: {str(e)}")
            return []

    def get_scan_stats(self) -> Dict[str, Any]:
        """Get statistics about scanned tokens"""
        try:
            with sqlite3.connect(self.scan_records_path) as db:
                cursor = db.cursor()
                
                stats = {}
                
                # Get total tokens
                cursor.execute("SELECT COUNT(*) FROM scan_records")
                stats['total_tokens'] = cursor.fetchone()[0]
                
                # Get tokens in last hour
                cursor.execute("""
                    SELECT COUNT(*) FROM scan_records 
                    WHERE scan_timestamp > datetime('now', '-1 hour')
                """)
                stats['tokens_last_hour'] = cursor.fetchone()[0]
                
                # Get average scans per token
                cursor.execute("SELECT AVG(total_scans) FROM scan_records")
                stats['avg_scans_per_token'] = cursor.fetchone()[0] or 0
                
                return stats
                
        except sqlite3.Error as e:
            print(f"Error getting scan stats: {str(e)}")
            return {}
