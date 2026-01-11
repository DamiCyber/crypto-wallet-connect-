let provider = null;
let signer = null;
let userAddress = null;
let walletTokens = []; // Store tokens for send functionality

// Wait for ethers.js to load
function waitForEthers() {
    return new Promise((resolve, reject) => {
        if (typeof ethers !== 'undefined') {
            resolve();
        } else {
            let attempts = 0;
            const checkEthers = setInterval(() => {
                attempts++;
                if (typeof ethers !== 'undefined') {
                    clearInterval(checkEthers);
                    resolve();
                } else if (attempts > 50) { // 5 seconds timeout
                    clearInterval(checkEthers);
                    reject(new Error('Failed to load ethers.js library. Please check your internet connection.'));
                }
            }, 100);
        }
    });
}

// Check if wallet is already connected
window.addEventListener('load', async () => {
    try {
        await waitForEthers();
        if (typeof window.ethereum !== 'undefined') {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    await connectWallet();
                }
            } catch (error) {
                console.error('Error checking wallet connection:', error);
            }
        }
    } catch (error) {
        console.error('Error loading ethers.js:', error);
        showError('Failed to load required library. Please refresh the page.');
    }
});

// Listen for account changes
if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            disconnectWallet();
        } else {
            connectWallet();
        }
    });

    window.ethereum.on('chainChanged', () => {
        window.location.reload();
    });
}

async function connectWallet() {
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const walletStatus = document.getElementById('walletStatus');
    const walletInfo = document.getElementById('walletInfo');
    const errorMessage = document.getElementById('errorMessage');

    // Hide error message
    errorMessage.classList.remove('show');
    errorMessage.textContent = '';

    // Check if ethers.js is loaded
    if (typeof ethers === 'undefined') {
        showError('Ethers.js library is not loaded. Please refresh the page.');
        return;
    }

    // Check if MetaMask is installed
    if (typeof window.ethereum === 'undefined') {
        showError('MetaMask or another Ethereum wallet is not installed. Please install MetaMask to continue.');
        return;
    }

    try {
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<span class="loading"></span> Connecting...';

        // Request account access
        await window.ethereum.request({ method: 'eth_requestAccounts' });

        // Create provider and signer
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();

        // Get network info
        const network = await provider.getNetwork();
        const networkName = network.name === 'homestead' ? 'Mainnet' : 
                           network.name === 'goerli' ? 'Goerli Testnet' :
                           network.name === 'sepolia' ? 'Sepolia Testnet' :
                           network.name;

        // Get balance
        const balance = await provider.getBalance(userAddress);
        const balanceInEth = ethers.utils.formatEther(balance);
        const formattedBalance = parseFloat(balanceInEth).toFixed(4);

        // Update UI
        walletStatus.innerHTML = `
            <div class="status-connected">
                <p style="font-size: 1.2rem; margin-bottom: 10px;">✓ Wallet Connected</p>
            </div>
        `;
        walletInfo.style.display = 'block';
        document.getElementById('walletAddress').textContent = userAddress;
        document.getElementById('walletBalance').textContent = `${formattedBalance} ETH`;
        
        const networkBadge = network.name === 'homestead' ? 'network-mainnet' :
                            network.name.includes('test') || network.name.includes('goerli') || network.name.includes('sepolia') ? 'network-testnet' :
                            'network-unknown';
        document.getElementById('walletNetwork').innerHTML = `
            <span class="network-badge ${networkBadge}">${networkName} (Chain ID: ${network.chainId})</span>
        `;

        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'block';
        document.getElementById('actionButtons').style.display = 'flex';

        // Load token balances and total value
        await loadAllTokensAndBalance();

    } catch (error) {
        console.error('Error connecting wallet:', error);
        if (error.code === 4001) {
            showError('Connection rejected. Please approve the connection request.');
        } else {
            showError('Failed to connect wallet: ' + error.message);
        }
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect Wallet';
    }
}

async function disconnectWallet() {
    try {
        // Revoke permissions from wallet provider (MetaMask, etc.)
        if (typeof window.ethereum !== 'undefined' && window.ethereum.request) {
            try {
                // Try to revoke permissions (EIP-2255)
                await window.ethereum.request({
                    method: 'wallet_revokePermissions',
                    params: [{
                        eth_accounts: {}
                    }]
                });
            } catch (error) {
                // Some wallets don't support wallet_revokePermissions
                // Try alternative method: request with empty accounts
                try {
                    // For wallets that support it, we can try to disconnect
                    if (window.ethereum.disconnect) {
                        await window.ethereum.disconnect();
                    }
                } catch (e) {
                    // If neither method works, just clear local state
                    console.log('Wallet provider does not support programmatic disconnect');
                }
            }
        }
    } catch (error) {
        console.error('Error during wallet disconnect:', error);
        // Continue with local state cleanup even if provider disconnect fails
    }

    // Clear local state
    provider = null;
    signer = null;
    userAddress = null;
    walletTokens = [];

    // Update UI
    const walletStatus = document.getElementById('walletStatus');
    const walletInfo = document.getElementById('walletInfo');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const errorMessage = document.getElementById('errorMessage');

    walletStatus.innerHTML = `
        <div class="status-disconnected">
            <p style="font-size: 1.2rem; margin-bottom: 10px;">⚡ Wallet Disconnected</p>
            <p style="font-size: 0.9rem;">Click the button below to connect</p>
        </div>
    `;
    walletInfo.style.display = 'none';
    document.getElementById('tokensSection').style.display = 'none';
    document.getElementById('totalBalanceCard').style.display = 'none';
    document.getElementById('actionButtons').style.display = 'none';
    connectBtn.style.display = 'block';
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect Wallet';
    disconnectBtn.style.display = 'none';
    errorMessage.classList.remove('show');
    
    // Close any open modals
    closeDepositModal();
    closeSendModal();
    
    // Clear any event listeners that might auto-reconnect
    // The accountsChanged listener will handle reconnection if user manually connects
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    setTimeout(() => {
        errorMessage.classList.remove('show');
    }, 5000);
}

// ERC-20 Token ABI
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

// Popular ERC-20 tokens on Ethereum Mainnet
const POPULAR_TOKENS = {
    1: [ // Ethereum Mainnet
        { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
        { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
        { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI', name: 'Uniswap', decimals: 18 },
        { address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', symbol: 'MATIC', name: 'Polygon', decimals: 18 },
        { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
        { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', symbol: 'SHIB', name: 'Shiba Inu', decimals: 18 },
        { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
        { address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', symbol: 'PEPE', name: 'Pepe', decimals: 18 }
    ],
    5: [ // Goerli Testnet
        { address: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F', symbol: 'USDC', name: 'USD Coin', decimals: 6 }
    ],
    11155111: [ // Sepolia Testnet
        { address: '0x779877A7B0D9E8603169DdbD7836e478b4624789', symbol: 'LINK', name: 'Chainlink', decimals: 18 }
    ]
};

// Token price cache
const tokenPriceCache = {};

// Get token price from CoinGecko
async function getTokenPrice(tokenAddress, symbol) {
    const cacheKey = `${tokenAddress}_${symbol}`;
    if (tokenPriceCache[cacheKey]) {
        return tokenPriceCache[cacheKey];
    }

    try {
        // Try to get price by contract address first
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=usd`
        );
        
        if (response.ok) {
            const data = await response.json();
            const price = data[tokenAddress.toLowerCase()]?.usd;
            if (price) {
                tokenPriceCache[cacheKey] = price;
                return price;
            }
        }
        
        // Fallback: try by symbol (for major tokens)
        const symbolResponse = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${symbol.toLowerCase()}&vs_currencies=usd`
        );
        
        if (symbolResponse.ok) {
            const symbolData = await symbolResponse.json();
            const price = symbolData[symbol.toLowerCase()]?.usd;
            if (price) {
                tokenPriceCache[cacheKey] = price;
                return price;
            }
        }
        
        return null;
    } catch (error) {
        console.error(`Error fetching price for ${symbol}:`, error);
        return null;
    }
}

// Get ETH price
async function getETHPrice() {
    if (tokenPriceCache['ETH']) {
        return tokenPriceCache['ETH'];
    }
    
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        if (response.ok) {
            const data = await response.json();
            const price = data.ethereum?.usd;
            if (price) {
                tokenPriceCache['ETH'] = price;
                return price;
            }
        }
    } catch (error) {
        console.error('Error fetching ETH price:', error);
    }
    return null;
}

// Expanded list of popular tokens to check
const EXPANDED_TOKENS = {
    1: [ // Ethereum Mainnet - expanded list
        { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
        { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
        { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', name: 'Wrapped BTC', decimals: 8 },
        { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI', name: 'Uniswap', decimals: 18 },
        { address: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0', symbol: 'MATIC', name: 'Polygon', decimals: 18 },
        { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
        { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', symbol: 'SHIB', name: 'Shiba Inu', decimals: 18 },
        { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
        { address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', symbol: 'PEPE', name: 'Pepe', decimals: 18 },
        { address: '0x4d224452801ACEd8B2F0aebE155379bb5D594381', symbol: 'APE', name: 'ApeCoin', decimals: 18 },
        { address: '0x3845badAde8e6dDD04FcF2D0b3b0b3b3b3b3b3b3b3b', symbol: 'SAND', name: 'The Sandbox', decimals: 18 },
        { address: '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942', symbol: 'MANA', name: 'Decentraland', decimals: 18 },
        { address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', symbol: 'MKR', name: 'Maker', decimals: 18 },
        { address: '0x0bc529c00C6401aEF6D220BE8c6E1668C0b3b3b3', symbol: 'YFI', name: 'yearn.finance', decimals: 18 },
        { address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', symbol: 'AAVE', name: 'Aave Token', decimals: 18 }
    ],
    5: [ // Goerli Testnet
        { address: '0x07865c6E87B9F70255377e024ace6630C1Eaa37F', symbol: 'USDC', name: 'USD Coin', decimals: 6 }
    ],
    11155111: [ // Sepolia Testnet
        { address: '0x779877A7B0D9E8603169DdbD7836e478b4624789', symbol: 'LINK', name: 'Chainlink', decimals: 18 }
    ]
};

// Discover tokens - try Etherscan API if available, otherwise use expanded token list
async function discoverTokens(address, chainId) {
    // Try Etherscan API for mainnet (works without API key but has rate limits)
    if (chainId === 1) {
        try {
            const response = await fetch(
                `https://api.etherscan.io/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=100&sort=asc`
            );
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === '1' && data.result && Array.isArray(data.result)) {
                    // Extract unique token addresses
                    const tokenAddresses = [...new Set(data.result.map(tx => tx.contractAddress).filter(addr => addr))];
                    if (tokenAddresses.length > 0) {
                        return tokenAddresses;
                    }
                }
            }
        } catch (error) {
            console.log('Etherscan API unavailable, using token list:', error);
        }
    }
    
    // Fallback: return expanded token list
    return (EXPANDED_TOKENS[chainId] || EXPANDED_TOKENS[1] || []).map(t => t.address);
}

async function loadAllTokensAndBalance() {
    if (!provider || !userAddress) return;

    const tokensSection = document.getElementById('tokensSection');
    const tokensList = document.getElementById('tokensList');
    const totalBalanceCard = document.getElementById('totalBalanceCard');
    const totalBalanceValue = document.getElementById('totalBalanceValue');
    
    tokensSection.style.display = 'block';
    totalBalanceCard.style.display = 'block';
    tokensList.innerHTML = '<div class="loading-tokens">Discovering and loading tokens...</div>';
    totalBalanceValue.textContent = 'Loading...';

    try {
        const network = await provider.getNetwork();
        const chainId = network.chainId;
        
        // Get ETH balance and price
        const ethBalance = await provider.getBalance(userAddress);
        const ethBalanceFormatted = parseFloat(ethers.utils.formatEther(ethBalance));
        const ethPrice = await getETHPrice();
        const ethValue = ethPrice ? ethBalanceFormatted * ethPrice : 0;
        
        // Discover tokens in wallet
        let tokenAddresses = [];
        if (chainId === 1) {
            // Try to discover all tokens
            tokenAddresses = await discoverTokens(userAddress, chainId);
        } else {
            // For testnets, use predefined list
            const tokens = POPULAR_TOKENS[chainId] || [];
            tokenAddresses = tokens.map(t => t.address);
        }
        
        // Also include expanded tokens to check
        const expandedTokens = EXPANDED_TOKENS[chainId] || EXPANDED_TOKENS[1] || [];
        const allTokenAddresses = [...new Set([...tokenAddresses, ...expandedTokens.map(t => t.address)])];
        
        // Create token info map
        const tokenInfoMap = {};
        expandedTokens.forEach(token => {
            tokenInfoMap[token.address.toLowerCase()] = token;
        });
        
        // Check balances for all tokens
        const tokenPromises = allTokenAddresses.map(async (tokenAddress) => {
            try {
                const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
                const balance = await tokenContract.balanceOf(userAddress);
                
                if (balance.isZero()) {
                    return null;
                }
                
                // Get token info
                let symbol, name, decimals;
                const cachedInfo = tokenInfoMap[tokenAddress.toLowerCase()];
                
                if (cachedInfo) {
                    symbol = cachedInfo.symbol;
                    name = cachedInfo.name;
                    decimals = cachedInfo.decimals;
                } else {
                    try {
                        symbol = await tokenContract.symbol();
                        name = await tokenContract.name();
                        decimals = await tokenContract.decimals();
                    } catch (e) {
                        // If contract calls fail, skip
                        return null;
                    }
                }
                
                const formattedBalance = parseFloat(ethers.utils.formatUnits(balance, decimals));
                
                // Get price
                const price = await getTokenPrice(tokenAddress, symbol);
                const usdValue = price ? formattedBalance * price : null;
                
                return {
                    symbol,
                    name,
                    balance: formattedBalance,
                    address: tokenAddress,
                    decimals,
                    price,
                    usdValue
                };
            } catch (error) {
                console.error(`Error fetching token ${tokenAddress}:`, error);
                return null;
            }
        });
        
        const results = await Promise.all(tokenPromises);
        const validTokens = results.filter(token => token !== null);
        
        // Add ETH to the list
        if (ethBalanceFormatted > 0) {
            validTokens.push({
                symbol: 'ETH',
                name: 'Ethereum',
                balance: ethBalanceFormatted,
                address: 'native',
                decimals: 18,
                price: ethPrice,
                usdValue: ethValue
            });
        }
        
        // Sort by USD value (highest first)
        validTokens.sort((a, b) => {
            const aValue = a.usdValue || 0;
            const bValue = b.usdValue || 0;
            return bValue - aValue;
        });
        
        // Calculate total portfolio value
        let totalValue = validTokens.reduce((sum, token) => sum + (token.usdValue || 0), 0);
        
        // Update total balance display
        totalBalanceValue.textContent = `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        // Update token count
        document.getElementById('tokenCount').textContent = validTokens.length;
        
        // Store tokens for send functionality
        walletTokens = validTokens;
        
        // Display tokens
        if (validTokens.length === 0) {
            tokensList.innerHTML = '<div class="no-tokens">No tokens found in your wallet.</div>';
            return;
        }
        
        // Display tokens
        tokensList.innerHTML = validTokens.map(token => {
            const balanceStr = token.balance.toFixed(6).replace(/\.?0+$/, '');
            const usdValueStr = token.usdValue 
                ? `$${token.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : 'Price unavailable';
            
            // Format address display
            let addressDisplay = '';
            if (token.address === 'native') {
                addressDisplay = '<span class="token-address-native">Native ETH</span>';
            } else {
                const addressShort = `${token.address.substring(0, 6)}...${token.address.substring(38)}`;
                addressDisplay = `<span class="token-address" data-address="${token.address}" title="Click to copy full address: ${token.address}">${addressShort}</span>`;
            }
            
            return `
                <div class="token-item">
                    <div class="token-info">
                        <div class="token-symbol">${token.symbol}</div>
                        <div class="token-name">${token.name}</div>
                        <div class="token-address-container">${addressDisplay}</div>
                    </div>
                    <div class="token-balance-container">
                        <div class="token-balance">${balanceStr}</div>
                        <div class="token-usd-value">${usdValueStr}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click handlers to copy addresses
        document.querySelectorAll('.token-address').forEach(element => {
            element.addEventListener('click', function() {
                const address = this.getAttribute('data-address');
                if (address) {
                    navigator.clipboard.writeText(address).then(() => {
                        const originalText = this.textContent;
                        this.textContent = 'Copied!';
                        this.style.color = '#28a745';
                        setTimeout(() => {
                            this.textContent = originalText;
                            this.style.color = '';
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy:', err);
                        // Fallback: show full address
                        this.textContent = address;
                        this.style.wordBreak = 'break-all';
                    });
                }
            });
        });
        
    } catch (error) {
        console.error('Error loading tokens and balance:', error);
        tokensList.innerHTML = '<div class="no-tokens">Error loading tokens. Please try again.</div>';
        totalBalanceValue.textContent = '$0.00';
    }
}

// Deposit/Receive Modal Functions
function showDepositModal() {
    if (!userAddress) {
        showError('Please connect your wallet first.');
        return;
    }
    
    const modal = document.getElementById('depositModal');
    const addressDisplay = document.getElementById('depositAddress');
    const qrContainer = document.getElementById('qrCodeContainer');
    
    addressDisplay.textContent = userAddress;
    
    // Generate QR code
    qrContainer.innerHTML = '';
    if (typeof QRCode !== 'undefined') {
        QRCode.toCanvas(qrContainer, userAddress, {
            width: 200,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        }, function (error) {
            if (error) {
                console.error('QR code generation error:', error);
                qrContainer.innerHTML = '<p style="color: #999;">QR code unavailable</p>';
            }
        });
    } else {
        qrContainer.innerHTML = '<p style="color: #999;">QR code library not loaded</p>';
    }
    
    modal.style.display = 'block';
}

function closeDepositModal() {
    document.getElementById('depositModal').style.display = 'none';
}

function copyDepositAddress() {
    if (!userAddress) return;
    
    navigator.clipboard.writeText(userAddress).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.background = '#28a745';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        showError('Failed to copy address');
    });
}

// Close modals when clicking outside
window.onclick = function(event) {
    const depositModal = document.getElementById('depositModal');
    const sendModal = document.getElementById('sendModal');
    if (event.target === depositModal) {
        closeDepositModal();
    }
    if (event.target === sendModal) {
        closeSendModal();
    }
}

// Send Modal Functions
function showSendModal() {
    if (!userAddress || !signer) {
        showError('Please connect your wallet first.');
        return;
    }
    
    const modal = document.getElementById('sendModal');
    const tokenSelect = document.getElementById('tokenSelect');
    const transactionInfo = document.getElementById('transactionInfo');
    
    // Clear previous data
    transactionInfo.style.display = 'none';
    document.getElementById('sendForm').reset();
    
    // Populate token select
    tokenSelect.innerHTML = '<option value="">Choose a token...</option>';
    
    walletTokens.forEach((token, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${token.symbol} - ${token.name} (Balance: ${parseFloat(token.balance).toFixed(6)})`;
        tokenSelect.appendChild(option);
    });
    
    updateTokenBalance();
    modal.style.display = 'block';
}

function closeSendModal() {
    document.getElementById('sendModal').style.display = 'none';
    document.getElementById('sendForm').reset();
    document.getElementById('transactionInfo').style.display = 'none';
}

function updateTokenBalance() {
    const tokenSelect = document.getElementById('tokenSelect');
    const balanceInfo = document.getElementById('balanceInfo');
    const selectedIndex = tokenSelect.value;
    
    if (selectedIndex === '' || !walletTokens[selectedIndex]) {
        balanceInfo.textContent = '';
        return;
    }
    
    const token = walletTokens[selectedIndex];
    balanceInfo.textContent = `Available: ${parseFloat(token.balance).toFixed(6)} ${token.symbol}`;
}

function setMaxAmount() {
    const tokenSelect = document.getElementById('tokenSelect');
    const amountInput = document.getElementById('amount');
    const selectedIndex = tokenSelect.value;
    
    if (selectedIndex === '' || !walletTokens[selectedIndex]) {
        showError('Please select a token first.');
        return;
    }
    
    const token = walletTokens[selectedIndex];
    amountInput.value = parseFloat(token.balance).toFixed(6);
}

async function handleSend(event) {
    event.preventDefault();
    
    if (!signer || !userAddress) {
        showError('Wallet not connected.');
        return;
    }
    
    const tokenSelect = document.getElementById('tokenSelect');
    const recipientAddress = document.getElementById('recipientAddress').value.trim();
    const amount = document.getElementById('amount').value;
    const sendSubmitBtn = document.getElementById('sendSubmitBtn');
    const transactionInfo = document.getElementById('transactionInfo');
    
    const selectedIndex = tokenSelect.value;
    if (selectedIndex === '' || !walletTokens[selectedIndex]) {
        showError('Please select a token.');
        return;
    }
    
    const token = walletTokens[selectedIndex];
    const amountFloat = parseFloat(amount);
    
    // Validation
    if (amountFloat <= 0) {
        showError('Amount must be greater than 0.');
        return;
    }
    
    if (amountFloat > parseFloat(token.balance)) {
        showError('Insufficient balance.');
        return;
    }
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
        showError('Invalid recipient address.');
        return;
    }
    
    try {
        sendSubmitBtn.disabled = true;
        sendSubmitBtn.innerHTML = '<span class="loading"></span> Sending...';
        transactionInfo.style.display = 'block';
        transactionInfo.className = 'transaction-info pending';
        transactionInfo.innerHTML = '⏳ Waiting for transaction confirmation...';
        
        let tx;
        
        if (token.address === 'native') {
            // Send ETH
            tx = await signer.sendTransaction({
                to: recipientAddress,
                value: ethers.utils.parseEther(amount)
            });
        } else {
            // Send ERC-20 token
            const tokenContract = new ethers.Contract(token.address, ERC20_ABI, signer);
            
            // Get decimals (should be stored in token object, fallback to 18)
            const decimals = token.decimals || 18;
            
            const amountWei = ethers.utils.parseUnits(amount, decimals);
            tx = await tokenContract.transfer(recipientAddress, amountWei);
        }
        
        // Get network for explorer link
        const network = await provider.getNetwork();
        let explorerUrl = 'https://etherscan.io';
        if (network.chainId === 5) {
            explorerUrl = 'https://goerli.etherscan.io';
        } else if (network.chainId === 11155111) {
            explorerUrl = 'https://sepolia.etherscan.io';
        }
        
        transactionInfo.className = 'transaction-info pending';
        transactionInfo.innerHTML = `⏳ Transaction submitted! Hash: <a href="${explorerUrl}/tx/${tx.hash}" target="_blank" class="transaction-link">${tx.hash.substring(0, 20)}...</a>`;
        
        // Wait for confirmation
        const receipt = await tx.wait();
        
        transactionInfo.className = 'transaction-info success';
        transactionInfo.innerHTML = `✅ Transaction confirmed! <a href="${explorerUrl}/tx/${tx.hash}" target="_blank" class="transaction-link">View on Etherscan</a>`;
        
        // Refresh balances
        setTimeout(async () => {
            await loadAllTokensAndBalance();
        }, 2000);
        
        // Reset form after 3 seconds
        setTimeout(() => {
            closeSendModal();
        }, 3000);
        
    } catch (error) {
        console.error('Send error:', error);
        transactionInfo.className = 'transaction-info error';
        
        if (error.code === 4001) {
            transactionInfo.innerHTML = '❌ Transaction rejected by user.';
        } else if (error.message) {
            transactionInfo.innerHTML = `❌ Error: ${error.message}`;
        } else {
            transactionInfo.innerHTML = '❌ Transaction failed. Please try again.';
        }
    } finally {
        sendSubmitBtn.disabled = false;
        sendSubmitBtn.textContent = 'Send Transaction';
    }
}
