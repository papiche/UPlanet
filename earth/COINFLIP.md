# St Petersburg Coin Flip

## Overview

A web-based implementation of the St. Petersburg paradox coin flip game, integrated with NOSTR authentication and UPlanet ZEN payments. Players use their MULTIPASS to play, and all transactions are processed through the CAPTAIN's MULTIPASS.

## Game Mechanics

### St. Petersburg Paradox
- **Progressive Payouts**: Payout doubles on each consecutive heads (2⁰ = 1, 2¹ = 2, 2² = 4, 2³ = 8...)
- **Risk vs Reward**: Players can choose to cash out at any time or continue flipping
- **Game End**: Game ends when tails appears, player loses cagnotte and sends 1 ẐEN to CAPTAIN

### Player Choice System
- **Cash Out**: Secure current winnings and end the game successfully
- **Continue**: Risk everything for double the payout on next flip
- **Tails Result**: Player loses all potential winnings and sends 1 ẐEN to CAPTAIN

## Authentication & Payment System

### MULTIPASS Requirement
- **MULTIPASS Only**: Only players with a valid MULTIPASS (g1pub in NOSTR profile) can play
- **Astroport Restriction**: Game can only be played on the Astroport where the player's MULTIPASS is registered (required for NOSTR relay to find player's key when sending like to CAPTAIN)

### Payment Flow
1. **Player MULTIPASS**: Used for player identification and balance checking
2. **CAPTAIN MULTIPASS**: All transactions are processed through CAPTAIN's wallet
3. **Payment System**: When TAILS appears, player sends like to CAPTAIN → triggers 1 ẐEN payment from player to CAPTAIN
4. **Winnings**: Paid directly to player's MULTIPASS from CAPTAIN's wallet when cashing out

## Game Modes

### Practice Mode
- **No Authentication**: Available to all users
- **Simulated Payments**: No real money involved
- **Payment Simulation**: TAILS payment from player to CAPTAIN is simulated, no real payments
- **Educational**: Learn game mechanics without financial risk

### Live Mode
- **MULTIPASS Required**: Must have valid MULTIPASS in NOSTR profile
- **Real Payments**: All transactions use real ZEN currency
- **Loss Payments**: TAILS sends like to CAPTAIN → 1 ẐEN payment from player to CAPTAIN processed
- **Winning Payouts**: Real ZEN payments sent to winner's MULTIPASS when cashing out

## Technical Implementation

### NOSTR Integration
- **Profile Fetching**: Retrieves player profile from NOSTR relays
- **MULTIPASS Detection**: Checks for g1pub or g1pubv2 tags in profile
- **Balance Checking**: Fetches player's ZEN balance via uSPOT API
- **Authentication**: NIP-42 relay authentication for secure communication

### Payment Processing
- **CAPTAIN Data**: Fetched from ASTROPORT station API
- **Transaction Source**: CAPTAIN's MULTIPASS (g1source parameter)
- **Transaction Destination**: Player's MULTIPASS (g1dest parameter)
- **API Endpoint**: `/zen_send` via uSPOT API

### Loss Payment System
- **NOSTR Event**: Kind 7 (reaction) sent to CAPTAIN's first message when TAILS occurs
- **Payment Trigger**: Like triggers 1 ẐEN payment from player to CAPTAIN
- **Relay Processing**: 7.sh script on relay processes the payment from player to CAPTAIN

## Game Flow

### 1. Connection & Authentication
- Connect with NOSTR extension
- Profile is fetched and validated
- MULTIPASS parameter is checked
- Balance is verified via uSPOT API

### 2. Game Initialization
- Game starts immediately with first flip
- Game mode determined (Practice vs Live)
- CAPTAIN data fetched for payment processing

### 3. Gameplay Loop
- **Heads**: Continue flipping, payout doubles, no payment
- **Tails**: Game ends, player loses all potential winnings, like sent to CAPTAIN → 1 ẐEN payment sent to CAPTAIN
- **Cash Out**: Player can secure winnings at any time and end game successfully

### 4. Payment Processing
- **Loss Payment**: 1 ẐEN sent from player to CAPTAIN when TAILS appears
- **Winning Payment**: Final winnings sent to player's MULTIPASS (only if player cashes out)
- **Loss Event**: When tails appears, player loses all potential winnings and sends 1 ẐEN to CAPTAIN
- **Transaction Source**: CAPTAIN's MULTIPASS wallet
- **Confirmation**: Payment status displayed to player

## API Integration

### uSPOT API
- **Balance Check**: `GET /check_balance?g1pub={G1PUB}`
- **Payment**: `POST /zen_send` with form data
- **Parameters**: g1source, g1dest, zen, npub, zencard

### ASTROPORT Station API
- **CAPTAIN Data**: Fetches captainHEX, captainG1pub, captainZencardG1pub
- **Endpoint**: Station URL configured via hostname detection

### NOSTR Relays
- **Profile Fetching**: Kind 0 events for player profiles
- **Like Publishing**: Kind 7 events for CAPTAIN reactions
- **Authentication**: NIP-42 challenge/response

## Security Features

### Authentication
- **NIP-42**: Secure relay authentication
- **MULTIPASS Verification**: Only verified profiles can play live mode
- **Astroport Restriction**: Prevents cross-domain gameplay

### Payment Security
- **CAPTAIN Source**: All payments originate from CAPTAIN's wallet
- **Player Destination**: Payments sent to verified player MULTIPASS
- **Transaction Validation**: All payments require valid MULTIPASS

### Session Management
- **Profile Validation**: Continuous verification of player credentials
- **Balance Checking**: Real-time balance updates
- **Payment Confirmation**: Detailed transaction status reporting

## Error Handling

### Common Issues
1. **"MULTIPASS required"**: Add g1pub tag to NOSTR profile
2. **"Astroport Required"**: Play only on registered Astroport domain
3. **Payment failed**: Check CAPTAIN balance and network connectivity
4. **Authentication failed**: Verify NOSTR extension and relay access

### Debug Information
- Console logging for all operations
- Payment request/response tracking
- Profile validation details
- Error condition reporting

## URL Parameters

- `qrcode`: AstroID QR code (optional)
- `pass`: AstroPASS (optional)
- `g1pub`: Source G1PUB for payment resolution (optional)

## Development Notes

### Local Testing
1. Start local UPlanet instance
2. Configure NOSTR relay (strfry)
3. Set up test MULTIPASS profiles
4. Test payment flows with CAPTAIN data

### Key Components
- **processIPFSMediaLinks()**: Handles media content in messages
- **fetchCaptainData()**: Retrieves CAPTAIN information
- **sendLikeToCaptain()**: Processes like payments
- **processWinningPayment()**: Handles final winnings

### Future Enhancements
- **Tournament Mode**: Multi-player competitions
- **Leaderboards**: Global and local rankings
- **Advanced Statistics**: Detailed game analytics
- **Mobile Optimization**: Responsive design improvements
