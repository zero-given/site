Last Updated: January 10, 2024 - 16:30 UTC

# TokenCard - Real-time Token Monitoring System

## Recent Changes
- Updated background color customization: To change the application background, modify the gradient classes in both App.tsx (main container) and TokenEventsList.tsx (list container). Example: `bg-gradient-to-br from-gray-900 via-gray-800 to-gray-700`
- Updated UI theme with subtle grey gradient background and consistent box styling
- Fixed WebSocket connection stability issues by implementing a robust heartbeat mechanism
- Enhanced token data synchronization between backend and frontend
- Improved error handling and reconnection logic
- Added comprehensive connection state management
- Implemented proper cleanup of WebSocket resources
- Fixed token update handling to ensure complete data retrieval

## System Architecture

### Overview
TokenCard is a real-time token monitoring system that consists of three main components:
1. Backend Server (Node.js/Express)
2. Frontend Application (React/TypeScript)
3. Token Monitor (Python)

### Data Flow & Communication

#### WebSocket Communication
The system uses WebSocket for real-time bidirectional communication between the backend and frontend:

1. **Connection Management**:
   - Frontend establishes WebSocket connection to `ws://localhost:3002`
   - Backend validates connections (localhost only)
   - Heartbeat mechanism (15s interval) ensures connection health
   - Automatic reconnection with exponential backoff (max 5 retries)

2. **Message Types**:
   - `PING/PONG`: Heartbeat messages for connection monitoring
   - `NEW_TOKEN`: Notification of newly discovered tokens
   - `CONNECTED`: Connection confirmation message

3. **State Management**:
   - Frontend tracks connection state (`isConnected`)
   - WebSocket state monitoring (`readyState`)
   - Retry count tracking for reconnection attempts
   - Last message timestamp logging

#### Token Data Flow

1. **Initial Load**:
   - Frontend fetches initial token list via REST API (`GET /api/tokens`)
   - Data is stored in React state (`tokens`)
   - TokenEventsList component renders token information

2. **Real-time Updates**:
   - Monitor detects new tokens and notifies backend
   - Backend broadcasts to all connected clients via WebSocket
   - Frontend receives `NEW_TOKEN` message
   - Frontend triggers full refresh to get complete token data
   - UI updates automatically through React state changes

### Backend Architecture

1. **Server Components**:
   - Express.js REST API server
   - WebSocket server for real-time updates
   - SQLite database for token storage
   - Client connection registry

2. **API Endpoints**:
   - `GET /api/tokens`: Retrieve all tokens
   - WebSocket endpoint for real-time updates

3. **Token Processing**:
   - Validation of token data
   - Deduplication checks
   - Timestamp management
   - Broadcasting to connected clients

### Frontend Architecture

1. **Component Structure**:
   - App.tsx: Main application container
   - TokenEventsList: Token display component
   - Debug panel for connection monitoring

2. **State Management**:
   - React hooks for local state
   - useRef for WebSocket and timer references
   - Custom logging system for debugging

3. **Connection Management**:
   - Automatic connection establishment
   - Heartbeat monitoring
   - Error handling and recovery
   - Manual reconnection option

### Error Handling & Recovery

1. **Connection Issues**:
   - Automatic reconnection attempts
   - Maximum retry limit (5 attempts)
   - Exponential backoff strategy
   - Clear error messaging to users

2. **Data Validation**:
   - Message format verification
   - Token data structure validation
   - Null/undefined checks
   - Error logging and reporting

### Performance Considerations

1. **Frontend**:
   - Efficient React rendering
   - Debounced updates
   - Resource cleanup
   - Connection state caching

2. **Backend**:
   - Connection validation
   - Client registry management
   - Efficient broadcasting
   - Resource monitoring

## Setup & Configuration

### Prerequisites
- Node.js 14+
- Python 3.8+
- SQLite3

### Installation
1. Clone the repository
2. Install backend dependencies: `cd backend && npm install`
3. Install frontend dependencies: `cd frontend && npm install`
4. Install monitor dependencies: `cd monitor && pip install -r requirements.txt`

### Running the System
1. Start backend: `cd backend && npm start`
2. Start frontend: `cd frontend && npm start`
3. Start monitor: `cd monitor && python monitor.py`

## Development Guidelines

### Code Style
- TypeScript for frontend
- ES6+ for backend
- Python PEP 8 for monitor
- Comprehensive error handling
- Detailed logging

### Testing
- Unit tests for critical components
- Integration tests for data flow
- Connection resilience testing
- Error scenario validation

## Monitoring & Debugging

### Available Tools
- Frontend debug panel
- Console logging system
- WebSocket state monitoring
- Connection status indicators

### Common Issues
- Connection timeouts: Check network and server status
- Missing token data: Verify monitor configuration
- Update delays: Check WebSocket connection
- State inconsistencies: Trigger manual refresh

## Future Improvements
- Enhanced error recovery mechanisms
- Advanced token validation
- Performance optimizations
- Extended monitoring capabilities
- User configuration options 

## Token Security Level Determination

The system uses a multi-factor approach to determine a token's security level:

### Security Levels
- **DANGER**: Tokens that are confirmed honeypots through simulation testing.
- **WARNING**: Tokens that have one or more concerning characteristics that require caution.
- **SAFE**: Tokens that have passed simulation tests and show no concerning characteristics.

### Warning Conditions
A token will be marked as WARNING if it has any of the following characteristics:

1. Contract Security Issues:
   - Contract is not open source
   - Contract uses proxy pattern
   - Token is mintable
   - Contract has external calls

2. Trading Restrictions:
   - Buying is restricted
   - Cannot sell all tokens
   - Trading cooldown enabled
   - Transfers can be paused

3. Ownership Concerns:
   - Hidden owner detected
   - Ownership can be taken back
   - Owner can change balances

4. High Tax Rates:
   - Buy tax exceeds 10%
   - Sell tax exceeds 10%

5. Anti-Whale Mechanisms:
   - Modifiable anti-whale mechanism
   - Modifiable slippage settings

### Implementation Details
- Security level is determined in real-time as token data updates
- Each condition is checked independently
- Multiple warning conditions may apply simultaneously
- Warning reasons are displayed to users for transparency 

## Frontend Component Structure

### TokenEventCard Component
The main display component that renders token information in a two-column layout:

1. **Left Column (3/5 width)**
   - Header with token name and security status
   - Warning panel (if applicable)
   - API call information
   - Grid of information boxes:
     - Token Info
     - Pair Info
     - Simulation Results
     - Contract Details
     - Honeypot Analysis
     - Holder Analysis
     - GoPlus Security Analysis (spans full width)

2. **Right Column (2/5 width)**
   - Liquidity Chart
   - Additional Analysis Panel

### Visual Layout
- Application uses a subtle grey gradient background (gray-50 to gray-200)
- Both columns use white container boxes with consistent styling
- Each information box has:
  - White background (`bg-white`)
  - Large rounded corners (`rounded-lg`)
  - Consistent shadow elevation (`shadow-lg`)
  - Uniform padding (`p-4`)
- Fixed-position filter widget on the left side
- Responsive grid layout that maintains alignment
- Border colors adjusted to match light theme

### Component Hierarchy
```
TokenEventsList
├── Filter Widget (fixed left)
└── Token Cards
    ├── TokenEventCard
    │   ├── Main Info (left column)
    │   │   ├── Header
    │   │   ├── Warning Panel
    │   │   ├── API Info
    │   │   └── Info Grid
    │   └── Charts (right column)
    │       ├── TokenLiquidityChart
    │       └── Additional Analysis
    └── More TokenEventCards...
```

### Styling Approach
- Uses Tailwind CSS for consistent styling
- Gradient backgrounds for headers
- Frosted glass effect for filter panel
- Shadow and hover effects for depth
- Responsive design principles
- Consistent color scheme throughout

### Key Features
- Real-time updates
- Interactive filtering and sorting
- Animated transitions
- Responsive layout
- Consistent visual hierarchy
- Clear data presentation 