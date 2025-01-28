# Token Scanner Development Knowledge Base

## API Rate Limit Handling

### GoPlus API
1. **Rate Limit Detection**
   - HTTP 429 status indicates rate limiting at the server level
   - API code 4029 indicates rate limiting at the API level
   - Don't confuse successful responses (code 1) with rate limits

2. **Proper Delay Strategy**
   - Use base delay before first API call (e.g., 5 seconds)
   - Implement exponential backoff for retries
   - Keep track of attempts and increase wait time accordingly

### Value Parsing and Validation

1. **Boolean Values**
   - GoPlus API returns "0"/"1" strings for boolean values
   - Must convert using `bool(int(value))` or similar
   - Always provide default values (usually "0") when accessing data

2. **Float Values**
   - Handle empty strings in numeric fields
   - Use safe conversion functions with defaults
   - Multiply percentage values by 100 for display
   - Example:
   ```python
   def safe_float(value, default=0.0):
       if not value or value == '':
           return default
       try:
           return float(value)
       except (ValueError, TypeError):
           return default
   ```

## Terminal Display

1. **Rich Library Usage**
   - Use Tables for structured data display
   - Implement proper padding and alignment
   - Use colors for status indicators (✓/✗)
   - Handle multiline data in cells

2. **Data Organization**
   - Group related information into categories
   - Use nested tables for complex data
   - Provide clear headers and separators
   - Include all available data points

## Error Handling

1. **Database Operations**
   - Define database path early in functions
   - Handle SQLite errors separately
   - Implement proper transaction management
   - Keep error records for failed operations

2. **API Calls**
   - Implement retry logic for failed calls
   - Handle timeouts and connection errors
   - Log detailed error information
   - Maintain state during errors

## Code Organization

1. **Configuration**
   - Use separate config file for settings
   - Implement defaults for missing values
   - Validate config on load
   - Document all config options

2. **Class Structure**
   - TokenTrackerMain: Main program controller
   - TokenChecker: Token analysis and database operations
   - TokenTracker: Web3 and contract interactions

## Common Issues and Solutions

1. **Rate Limit False Positives**
   - Problem: Code treating success responses as rate limits
   - Solution: Properly check response codes and status

2. **Value Conversion Errors**
   - Problem: Empty strings in numeric fields
   - Solution: Implement safe conversion functions

3. **Missing Data Display**
   - Problem: Not showing all available API data
   - Solution: Update table creation to include all fields

4. **Database Connection Issues**
   - Problem: Undefined database path in error handlers
   - Solution: Define path at function start

## Best Practices

1. **API Interaction**
   - Implement proper delays between calls
   - Handle rate limits gracefully
   - Validate response data
   - Log API interactions

2. **Data Processing**
   - Use safe conversion functions
   - Provide default values
   - Validate data types
   - Handle missing fields

3. **Error Handling**
   - Log detailed error information
   - Implement proper retries
   - Maintain system state
   - Clean up resources

4. **Code Documentation**
   - Document complex logic
   - Explain API interactions
   - Detail error handling
   - Describe data structures

## Future Improvements

1. **API Integration**
   - Implement API key rotation
   - Add more error recovery
   - Cache API responses
   - Add request queuing

2. **Data Display**
   - Add more visualization options
   - Implement data filtering
   - Add export capabilities
   - Improve table formatting

3. **Error Handling**
   - Add more detailed logging
   - Implement automatic recovery
   - Add system monitoring
   - Improve error reporting

4. **Performance**
   - Optimize database operations
   - Implement connection pooling
   - Add request batching
   - Optimize memory usage 