from rich.console import Console
from rich.table import Table
from rich.style import Style
from rich.text import Text
from datetime import datetime

# Initialize console for rich text output
console = Console()

def log_message(message: str, level: str = "INFO"):
    """
    Log a message with timestamp and colored level indicator
    
    Features:
    - Adds timestamps to all messages
    - Color codes different log levels
    - Consistent format for all program output
    
    Args:
        message: The message to log
        level: Log level (INFO, WARNING, ERROR, DEBUG)
    """
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    style_map = {
        "INFO": "green",
        "WARNING": "yellow",
        "ERROR": "red",
        "DEBUG": "blue"
    }
    style = style_map.get(level, "white")
    console.print(f"[{timestamp}] [{style}]{level}[/]: {message}")

def create_pair_table(pair_data: dict) -> Table:
    """
    Create a nicely formatted table for token pair information
    
    Features:
    - Groups related data into categories
    - Uses nested tables for complex data
    - Applies consistent styling and formatting
    - Handles missing or invalid data gracefully
    
    Args:
        pair_data: Dictionary containing token and pair information
        
    Returns:
        Rich Table object with formatted pair data
    """
    main_table = Table(title="Token Analysis", border_style="blue", show_header=True)
    main_table.add_column("Category", style="cyan", no_wrap=True)
    main_table.add_column("Information", style="green")
    
    if pair_data:
        for category, details in pair_data.items():
            # Create a nested table for each category
            nested_table = Table(show_header=False, box=None, padding=(0,1))
            nested_table.add_column("Field", style="yellow")
            nested_table.add_column("Value", style="white")
            
            # Add rows to nested table with proper formatting
            for field, value in details.items():
                nested_table.add_row(field, str(value))
            
            # Add the nested table to the main table
            main_table.add_row(category, nested_table)
    else:
        main_table.add_row("No Data", "No pair information available")
    
    return main_table

def create_security_table(security_data: dict) -> Table:
    """
    Create a nicely formatted table for security analysis information
    
    Features:
    - Shows pass/fail status with colored indicators
    - Handles multiline data with proper alignment
    - Groups security checks by category
    - Provides clear status indicators (✓/✗)
    
    Args:
        security_data: Dictionary containing security analysis results
        
    Returns:
        Rich Table object with formatted security data
    """
    main_table = Table(title="Security Analysis", border_style="red", show_header=True)
    main_table.add_column("Category", style="cyan", no_wrap=True)
    main_table.add_column("Status", style="green", width=8)
    main_table.add_column("Details", style="yellow")
    
    if security_data:
        for category, details in security_data.items():
            # Determine status and style based on passed flag
            status = "✓" if details.get("passed", False) else "✗"
            status_style = "green" if details.get("passed", False) else "red"
            
            # Format multiline details with proper alignment
            details_text = details.get("details", "No details available")
            if isinstance(details_text, str) and "\n" in details_text:
                # Create a nested table for multiline details
                details_table = Table(show_header=False, box=None, padding=(0,1))
                details_table.add_column("Info", style="white")
                for line in details_text.split("\n"):
                    # Add proper spacing for alignment
                    details_table.add_row(f" {line}")
                main_table.add_row(
                    category,
                    Text(status, style=status_style),
                    details_table
                )
            else:
                main_table.add_row(
                    category,
                    Text(status, style=status_style),
                    f" {str(details_text)}"
                )
    else:
        main_table.add_row("No Data", "N/A", "No security information available")
    
    return main_table