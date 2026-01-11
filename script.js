let provider = null;
let signer = null;
let userAddress = null;
let walletTokens = []; // Store tokens for send functionality
let selectedChainId = 1; // Default to Ethereum Mainnet
let isSolana = false; // Flag to track if we're on Solana
let solanaConnection = null; // Solana connection object
let solanaWallet = null; // Solana wallet adapter

// Chain configurations
const CHAIN_CONFIG = {
    1: {
        name: 'Ethereum Mainnet',
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
        blockExplorerUrls: ['https://etherscan.io'],
        chainId: '0x1'
    },
    137: {
        name: 'Polygon',
        nativeCurrency: { symbol: 'MATIC', decimals: 18 },
        rpcUrls: ['https://polygon.llamarpc.com', 'https://rpc.ankr.com/polygon'],
        blockExplorerUrls: ['https://polygonscan.com'],
        chainId: '0x89'
    },
    56: {
        name: 'BNB Smart Chain',
        nativeCurrency: { symbol: 'BNB', decimals: 18 },
        rpcUrls: ['https://bsc-dataseed.binance.org', 'https://rpc.ankr.com/bsc'],
        blockExplorerUrls: ['https://bscscan.com'],
        chainId: '0x38'
    },
    42161: {
        name: 'Arbitrum One',
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'],
        blockExplorerUrls: ['https://arbiscan.io'],
        chainId: '0xa4b1'
    },
    10: {
        name: 'Optimism',
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://mainnet.optimism.io', 'https://rpc.ankr.com/optimism'],
        blockExplorerUrls: ['https://optimistic.etherscan.io'],
        chainId: '0xa'
    },
    43114: {
        name: 'Avalanche C-Chain',
        nativeCurrency: { symbol: 'AVAX', decimals: 18 },
        rpcUrls: ['https://api.avax.network/ext/bc/C/rpc', 'https://rpc.ankr.com/avalanche'],
        blockExplorerUrls: ['https://snowtrace.io'],
        chainId: '0xa86a'
    },
    250: {
        name: 'Fantom',
        nativeCurrency: { symbol: 'FTM', decimals: 18 },
        rpcUrls: ['https://rpc.ftm.tools', 'https://rpc.ankr.com/fantom'],
        blockExplorerUrls: ['https://ftmscan.com'],
        chainId: '0xfa'
    },
    5: {
        name: 'Goerli Testnet',
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.ankr.com/eth_goerli', 'https://goerli.blockpi.network/v1/rpc/public'],
        blockExplorerUrls: ['https://goerli.etherscan.io'],
        chainId: '0x5'
    },
    11155111: {
        name: 'Sepolia Testnet',
        nativeCurrency: { symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.ankr.com/eth_sepolia', 'https://sepolia.blockpi.network/v1/rpc/public'],
        blockExplorerUrls: ['https://sepolia.etherscan.io'],
        chainId: '0xaa36a7'
    },
    'solana': {
        name: 'Solana',
        nativeCurrency: { symbol: 'SOL', decimals: 9 },
        rpcUrls: ['https://api.mainnet-beta.solana.com'],
        blockExplorerUrls: ['https://solscan.io'],
        chainId: 'solana',
        isSolana: true
    }
};

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
        // Get saved chain selection or default to Ethereum
        const savedChain = localStorage.getItem('selectedChainId');
        if (savedChain) {
            if (savedChain === 'solana') {
                selectedChainId = 'solana';
                isSolana = true;
                document.getElementById('chainSelect').value = 'solana';
            } else if (CHAIN_CONFIG[parseInt(savedChain)]) {
                selectedChainId = parseInt(savedChain);
                isSolana = false;
                document.getElementById('chainSelect').value = savedChain;
            }
        }
        
        const walletProvider = detectWalletProvider();
        if (walletProvider) {
            try {
                const accounts = await walletProvider.request({ method: 'eth_accounts' });
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

// Handle chain selection change
function onChainChange() {
    const chainSelect = document.getElementById('chainSelect');
    const value = chainSelect.value;
    
    // Check if Solana
    if (value === 'solana') {
        selectedChainId = 'solana';
        isSolana = true;
    } else {
        selectedChainId = parseInt(value);
        isSolana = false;
    }
    
    localStorage.setItem('selectedChainId', selectedChainId);
    
    // If wallet is connected, switch chain
    if (userAddress) {
        if (isSolana && solanaWallet) {
            // Already on Solana, just reload
            updateWalletInfo();
        } else if (!isSolana && provider) {
            switchChain();
        } else {
            // Need to reconnect
            disconnectWallet();
        }
    }
}

// Listen for account changes - check dynamically
function setupWalletListeners() {
    const walletProvider = detectWalletProvider();
    if (walletProvider && walletProvider.on) {
        walletProvider.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                connectWallet();
            }
        });

        walletProvider.on('chainChanged', () => {
            window.location.reload();
        });
    }
}

// Setup listeners when page loads
window.addEventListener('load', () => {
    // Wait a bit for wallets to inject
    setTimeout(setupWalletListeners, 1000);
});

// Switch to selected chain
async function switchChain() {
    const walletProvider = detectWalletProvider();
    if (!walletProvider) return;
    
    const chainConfig = CHAIN_CONFIG[selectedChainId];
    if (!chainConfig) {
        showError('Selected chain not supported.');
        return;
    }
    
    try {
        // Try to switch to the chain
        await walletProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainConfig.chainId }]
        });
        
        // Reload wallet info after chain switch
        if (userAddress) {
            await updateWalletInfo();
        }
    } catch (switchError) {
        // This error code indicates that the chain has not been added to the wallet
        if (switchError.code === 4902) {
            try {
                await walletProvider.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: chainConfig.chainId,
                        chainName: chainConfig.name,
                        nativeCurrency: chainConfig.nativeCurrency,
                        rpcUrls: chainConfig.rpcUrls,
                        blockExplorerUrls: chainConfig.blockExplorerUrls
                    }]
                });
                
                // Reload wallet info after adding chain
                if (userAddress) {
                    await updateWalletInfo();
                }
            } catch (addError) {
                console.error('Error adding chain:', addError);
                showError('Failed to add chain to wallet. Please add it manually.');
            }
        } else {
            console.error('Error switching chain:', switchError);
            showError('Failed to switch chain. Please try again.');
        }
    }
}

async function connectWallet() {
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const walletStatus = document.getElementById('walletStatus');
    const walletInfo = document.getElementById('walletInfo');
    const errorMessage = document.getElementById('errorMessage');
    const chainSelect = document.getElementById('chainSelect');

    // Hide error message
    errorMessage.classList.remove('show');
    errorMessage.textContent = '';

    try {
        connectBtn.disabled = true;
        chainSelect.disabled = true;
        connectBtn.innerHTML = '<span class="loading"></span> Connecting...';

        // Get selected chain
        const value = chainSelect.value;
        if (value === 'solana') {
            selectedChainId = 'solana';
            isSolana = true;
            await connectSolanaWallet();
        } else {
            selectedChainId = parseInt(value);
            isSolana = false;
            await connectEVMWallet();
        }
        
        localStorage.setItem('selectedChainId', selectedChainId);

    } catch (error) {
        console.error('Error connecting wallet:', error);
        if (error.code === 4001) {
            showError('Connection rejected. Please approve the connection request.');
        } else {
            showError('Failed to connect wallet: ' + error.message);
        }
        connectBtn.disabled = false;
        chainSelect.disabled = false;
        connectBtn.textContent = 'Connect Wallet';
    }
}

// Detect available wallet providers
function detectWalletProvider() {
    // Check for various wallet providers
    if (typeof window.ethereum !== 'undefined') {
        return window.ethereum;
    }
    
    // Check for Trust Wallet
    if (window.trustwallet) {
        return window.trustwallet;
    }
    
    // Check for Coinbase Wallet
    if (window.coinbaseWalletExtension) {
        return window.coinbaseWalletExtension;
    }
    
    // Check for other common providers
    if (window.web3 && window.web3.currentProvider) {
        return window.web3.currentProvider;
    }
    
    return null;
}

async function connectEVMWallet() {
    // Check if ethers.js is loaded
    if (typeof ethers === 'undefined') {
        showError('Ethers.js library is not loaded. Please refresh the page.');
        return;
    }

    // Detect wallet provider
    const walletProvider = detectWalletProvider();
    
    if (!walletProvider) {
        // Check if we're on mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            showError('No Ethereum wallet detected. Please open this page in a wallet browser (MetaMask, Trust Wallet, Coinbase Wallet, etc.) or install a wallet extension.');
        } else {
            showError('No Ethereum wallet detected. Please install MetaMask, Trust Wallet, Coinbase Wallet, or another compatible wallet extension.');
        }
        return;
    }

    // Switch to selected chain
    await switchChain();

    // Request account access
    await walletProvider.request({ method: 'eth_requestAccounts' });

    // Create provider and signer
    provider = new ethers.providers.Web3Provider(walletProvider);
    signer = provider.getSigner();
    userAddress = await signer.getAddress();

    // Update wallet info
    await updateWalletInfo();
}

async function connectSolanaWallet() {
    // Check if Solana Web3 is loaded
    if (typeof window.solana === 'undefined' && typeof window.phantom === 'undefined') {
        showError('Solana wallet (Phantom, Solflare, etc.) is not installed. Please install a Solana wallet to continue.');
        return;
    }

    // Try Phantom first, then other wallets
    const wallet = window.phantom?.solana || window.solana;
    
    if (!wallet || !wallet.isPhantom) {
        showError('Phantom wallet is not installed. Please install Phantom wallet.');
        return;
    }

    try {
        // Connect to Phantom
        const response = await wallet.connect();
        solanaWallet = wallet;
        userAddress = response.publicKey.toString();
        
        // Create Solana connection
        if (typeof solanaWeb3 !== 'undefined') {
            solanaConnection = new solanaWeb3.Connection(
                'https://api.mainnet-beta.solana.com',
                'confirmed'
            );
        } else if (typeof window.solanaWeb3 !== 'undefined') {
            solanaConnection = new window.solanaWeb3.Connection(
                'https://api.mainnet-beta.solana.com',
                'confirmed'
            );
        } else {
            showError('Solana Web3 library is not loaded. Please refresh the page.');
            return;
        }

        // Update wallet info
        await updateWalletInfo();
    } catch (error) {
        console.error('Error connecting Solana wallet:', error);
        throw error;
    }
}

async function updateWalletInfo() {
    if (!userAddress) return;
    
    const walletStatus = document.getElementById('walletStatus');
    const walletInfo = document.getElementById('walletInfo');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const connectBtn = document.getElementById('connectBtn');
    const chainSelect = document.getElementById('chainSelect');
    
    try {
        let networkName, nativeSymbol, formattedBalance, chainId;
        
        if (isSolana && solanaConnection && solanaWallet) {
            // Solana wallet info
            const chainConfig = CHAIN_CONFIG['solana'];
            networkName = chainConfig.name;
            nativeSymbol = chainConfig.nativeCurrency.symbol;
            
            // Get SOL balance
            const publicKey = new solanaWeb3.PublicKey(userAddress);
            const balance = await solanaConnection.getBalance(publicKey);
            const balanceInSol = balance / solanaWeb3.LAMPORTS_PER_SOL;
            formattedBalance = parseFloat(balanceInSol).toFixed(4);
            chainId = 'solana';
        } else if (provider) {
            // EVM wallet info
            const network = await provider.getNetwork();
            const chainConfig = CHAIN_CONFIG[network.chainId] || CHAIN_CONFIG[selectedChainId];
            networkName = chainConfig ? chainConfig.name : `Chain ${network.chainId}`;
            nativeSymbol = chainConfig ? chainConfig.nativeCurrency.symbol : 'ETH';
            chainId = network.chainId;

            // Get balance
            const balance = await provider.getBalance(userAddress);
            const balanceFormatted = ethers.utils.formatEther(balance);
            formattedBalance = parseFloat(balanceFormatted).toFixed(4);
        } else {
            return;
        }

        // Update UI
        walletStatus.innerHTML = `
            <div class="status-connected">
                <p style="font-size: 1.2rem; margin-bottom: 10px;">✓ Wallet Connected</p>
            </div>
        `;
        walletInfo.style.display = 'block';
        document.getElementById('walletAddress').textContent = userAddress;
        document.getElementById('walletBalance').textContent = `${formattedBalance} ${nativeSymbol}`;
        
        const networkBadge = chainId === 1 ? 'network-mainnet' :
                            chainId === 5 || chainId === 11155111 ? 'network-testnet' :
                            chainId === 'solana' ? 'network-mainnet' :
                            'network-unknown';
        document.getElementById('walletNetwork').innerHTML = `
            <span class="network-badge ${networkBadge}">${networkName}${chainId !== 'solana' ? ` (Chain ID: ${chainId})` : ''}</span>
        `;

        connectBtn.style.display = 'none';
        disconnectBtn.style.display = 'block';
        document.getElementById('actionButtons').style.display = 'flex';
        chainSelect.disabled = false;

        // Load token balances and total value
        await loadAllTokensAndBalance();

    } catch (error) {
        console.error('Error updating wallet info:', error);
        showError('Failed to update wallet information.');
    }
}

async function disconnectWallet() {
    try {
        if (isSolana && solanaWallet) {
            // Disconnect Solana wallet
            await solanaWallet.disconnect();
        }
        // For EVM wallets, we just clear local state without revoking permissions
    } catch (error) {
        console.error('Error during wallet disconnect:', error);
        // Continue with local state cleanup even if provider disconnect fails
    }

    // Clear local state
    provider = null;
    signer = null;
    userAddress = null;
    walletTokens = [];
    solanaConnection = null;
    solanaWallet = null;
    isSolana = false;

    // Update UI
    const walletStatus = document.getElementById('walletStatus');
    const walletInfo = document.getElementById('walletInfo');
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const errorMessage = document.getElementById('errorMessage');
    const chainSelect = document.getElementById('chainSelect');

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
    chainSelect.disabled = false;
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

// Get native token price
async function getNativeTokenPrice(chainId) {
    const chainConfig = CHAIN_CONFIG[chainId] || CHAIN_CONFIG[1];
    const nativeSymbol = chainConfig.nativeCurrency.symbol;
    const cacheKey = `${nativeSymbol}_${chainId}`;
    
    if (tokenPriceCache[cacheKey]) {
        return tokenPriceCache[cacheKey];
    }
    
    try {
        // Map chain native tokens to CoinGecko IDs
        const coinGeckoIds = {
            'ETH': 'ethereum',
            'MATIC': 'matic-network',
            'BNB': 'binancecoin',
            'AVAX': 'avalanche-2',
            'FTM': 'fantom',
            'SOL': 'solana'
        };
        
        const coinId = coinGeckoIds[nativeSymbol] || 'ethereum';
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
        if (response.ok) {
            const data = await response.json();
            const price = data[coinId]?.usd;
            if (price) {
                tokenPriceCache[cacheKey] = price;
                return price;
            }
        }
    } catch (error) {
        console.error(`Error fetching ${nativeSymbol} price:`, error);
    }
    return null;
}

// Get ETH price (kept for backward compatibility)
async function getETHPrice() {
    return getNativeTokenPrice(1);
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
    if (!userAddress) return;
    
    // Handle Solana separately
    if (isSolana && solanaConnection) {
        await loadSolanaTokensAndBalance();
        return;
    }
    
    if (!provider) return;

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
        
        // Get native token balance and price
        const nativeBalance = await provider.getBalance(userAddress);
        const nativeBalanceFormatted = parseFloat(ethers.utils.formatEther(nativeBalance));
        const nativePrice = await getNativeTokenPrice(chainId);
        const nativeValue = nativePrice ? nativeBalanceFormatted * nativePrice : 0;
        
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
                
                // Try to get balance with error handling
                let balance;
                try {
                    balance = await Promise.race([
                        tokenContract.balanceOf(userAddress),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                    ]);
                } catch (balanceError) {
                    // If balanceOf fails, this is not a valid token or doesn't exist on this chain
                    return null;
                }
                
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
                        // Try to get token info with timeout
                        const [symbolResult, nameResult, decimalsResult] = await Promise.race([
                            Promise.all([
                                tokenContract.symbol(),
                                tokenContract.name(),
                                tokenContract.decimals()
                            ]),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
                        ]);
                        symbol = symbolResult;
                        name = nameResult;
                        decimals = decimalsResult;
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
                // Suppress expected errors (CALL_EXCEPTION, execution reverted, etc.)
                // These are normal when checking many token addresses
                const isExpectedError = 
                    error.code === 'CALL_EXCEPTION' || 
                    error.reason === 'execution reverted' ||
                    error.message?.includes('revert') ||
                    error.message?.includes('CALL_EXCEPTION') ||
                    error.message === 'Timeout';
                
                if (!isExpectedError) {
                    // Only log unexpected errors
                    console.error(`Unexpected error fetching token ${tokenAddress}:`, error);
                }
                return null;
            }
        });
        
        const results = await Promise.all(tokenPromises);
        const validTokens = results.filter(token => token !== null);
        
        // Add native token to the list
        const chainConfig = CHAIN_CONFIG[chainId] || CHAIN_CONFIG[1];
        const nativeSymbol = chainConfig.nativeCurrency.symbol;
        const nativeName = chainConfig.name.split(' ')[0]; // Get first word (Ethereum, Polygon, etc.)
        
        if (nativeBalanceFormatted > 0) {
            validTokens.push({
                symbol: nativeSymbol,
                name: nativeName,
                balance: nativeBalanceFormatted,
                address: 'native',
                decimals: chainConfig.nativeCurrency.decimals,
                price: nativePrice,
                usdValue: nativeValue
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
                const chainConfig = CHAIN_CONFIG[chainId] || CHAIN_CONFIG[1];
                addressDisplay = `<span class="token-address-native">Native ${chainConfig.nativeCurrency.symbol}</span>`;
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

async function loadSolanaTokensAndBalance() {
    if (!solanaConnection || !userAddress) return;

    const tokensSection = document.getElementById('tokensSection');
    const tokensList = document.getElementById('tokensList');
    const totalBalanceCard = document.getElementById('totalBalanceCard');
    const totalBalanceValue = document.getElementById('totalBalanceValue');
    
    tokensSection.style.display = 'block';
    totalBalanceCard.style.display = 'block';
    tokensList.innerHTML = '<div class="loading-tokens">Loading SOL balance...</div>';
    totalBalanceValue.textContent = 'Loading...';

    try {
        const SolanaWeb3 = solanaWeb3 || window.solanaWeb3;
        const publicKey = new SolanaWeb3.PublicKey(userAddress);
        
        // Get SOL balance
        const balance = await solanaConnection.getBalance(publicKey);
        const balanceInSol = balance / SolanaWeb3.LAMPORTS_PER_SOL;
        const solPrice = await getNativeTokenPrice('solana');
        const solValue = solPrice ? balanceInSol * solPrice : 0;
        
        const validTokens = [];
        
        // Add SOL to the list
        if (balanceInSol > 0) {
            validTokens.push({
                symbol: 'SOL',
                name: 'Solana',
                balance: balanceInSol,
                address: 'native',
                decimals: 9,
                price: solPrice,
                usdValue: solValue
            });
        }
        
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
            
            let addressDisplay = '';
            if (token.address === 'native') {
                addressDisplay = '<span class="token-address-native">Native SOL</span>';
            } else {
                const addressShort = `${token.address.substring(0, 6)}...${token.address.substring(token.address.length - 4)}`;
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
        
    } catch (error) {
        console.error('Error loading Solana tokens and balance:', error);
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
    if (!userAddress) {
        showError('Please connect your wallet first.');
        return;
    }
    
    // For Solana, we don't need signer
    if (!isSolana && !signer) {
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
    
    if (!userAddress) {
        showError('Wallet not connected.');
        return;
    }
    
    // Handle Solana separately
    if (isSolana && solanaWallet) {
        await handleSolanaSend(event);
        return;
    }
    
    if (!signer) {
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
            // Send native token (ETH, MATIC, BNB, etc.)
            const network = await provider.getNetwork();
            const chainConfig = CHAIN_CONFIG[network.chainId] || CHAIN_CONFIG[1];
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
        const chainConfig = CHAIN_CONFIG[network.chainId] || CHAIN_CONFIG[1];
        const explorerUrl = chainConfig.blockExplorerUrls[0] || 'https://etherscan.io';
        
        transactionInfo.className = 'transaction-info pending';
        transactionInfo.innerHTML = `⏳ Transaction submitted! Hash: <a href="${explorerUrl}/tx/${tx.hash}" target="_blank" class="transaction-link">${tx.hash.substring(0, 20)}...</a>`;
        
        // Wait for confirmation
        const receipt = await tx.wait();
        
        const explorerName = chainConfig.name.includes('Ethereum') ? 'Etherscan' : 
                            chainConfig.name.includes('Polygon') ? 'Polygonscan' :
                            chainConfig.name.includes('BNB') ? 'BscScan' :
                            chainConfig.name.includes('Arbitrum') ? 'Arbiscan' :
                            chainConfig.name.includes('Optimism') ? 'Etherscan' :
                            chainConfig.name.includes('Avalanche') ? 'Snowtrace' :
                            chainConfig.name.includes('Fantom') ? 'FtmScan' : 'Explorer';
        transactionInfo.className = 'transaction-info success';
        transactionInfo.innerHTML = `✅ Transaction confirmed! <a href="${explorerUrl}/tx/${tx.hash}" target="_blank" class="transaction-link">View on ${explorerName}</a>`;
        
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

async function handleSolanaSend(event) {
    event.preventDefault();
    
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
    
    // Validate Solana address (base58, 32-44 characters)
    try {
        new solanaWeb3.PublicKey(recipientAddress);
    } catch (e) {
        showError('Invalid Solana recipient address.');
        return;
    }
    
    try {
        sendSubmitBtn.disabled = true;
        sendSubmitBtn.innerHTML = '<span class="loading"></span> Sending...';
        transactionInfo.style.display = 'block';
        transactionInfo.className = 'transaction-info pending';
        transactionInfo.innerHTML = '⏳ Waiting for transaction confirmation...';
        
        if (token.address === 'native') {
            // Send SOL
            const recipientPubkey = new solanaWeb3.PublicKey(recipientAddress);
            const senderPubkey = new solanaWeb3.PublicKey(userAddress);
            const lamports = amountFloat * solanaWeb3.LAMPORTS_PER_SOL;
            
            const transaction = new solanaWeb3.Transaction().add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: senderPubkey,
                    toPubkey: recipientPubkey,
                    lamports: lamports
                })
            );
            
            const signature = await solanaWallet.sendTransaction(transaction, solanaConnection);
            await solanaConnection.confirmTransaction(signature, 'confirmed');
            
            const explorerUrl = 'https://solscan.io';
            transactionInfo.className = 'transaction-info success';
            transactionInfo.innerHTML = `✅ Transaction confirmed! <a href="${explorerUrl}/tx/${signature}" target="_blank" class="transaction-link">View on Solscan</a>`;
        } else {
            showError('SPL token transfers not yet supported.');
            return;
        }
        
        // Refresh balances
        setTimeout(async () => {
            await loadAllTokensAndBalance();
        }, 2000);
        
        // Reset form after 3 seconds
        setTimeout(() => {
            closeSendModal();
        }, 3000);
        
    } catch (error) {
        console.error('Solana send error:', error);
        transactionInfo.className = 'transaction-info error';
        
        if (error.code === 4001 || error.message?.includes('User rejected')) {
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
