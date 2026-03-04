// ============================================================================
// 全局变量
let provider;
let signer;
let userAddress;
let chainId;
let currentProjectId = null;
let walletConnected = false;
let isConnecting = false; // 新增：连接状态锁，防止重复请求

// API 基础URL
const API_BASE_URL = 'http://localhost:5000/api';

// 合约信息
let CONTRACT_BYTECODE = "";
let CONTRACT_ABI = [];
let contractInfoLoaded = false;

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
    await loadContractInfo();
    initEventListeners();
    checkWalletConnection();
    loadRecentProjects();
    setInterval(loadRecentProjects, 30000);
});

// 从后端加载合约信息
async function loadContractInfo() {
    try {
        showLoading('加载合约信息...');

        const response = await fetch(`${API_BASE_URL}/contract-info`);
        const result = await response.json();

        if (result.success && result.data) {
            CONTRACT_BYTECODE = result.data.bytecode;
            CONTRACT_ABI = result.data.abi;
            contractInfoLoaded = true;
            console.log('✅ 合约信息加载成功');
            console.log('字节码长度:', CONTRACT_BYTECODE.length);
        } else {
            console.error('加载合约信息失败:', result.error);
            // 使用备用ABI
            CONTRACT_ABI = [
                "constructor(string name, string symbol, uint256 initialSupply, address owner, bool mintable, bool burnable, bool pausable, bool permit)",
                "function name() view returns (string)",
                "function symbol() view returns (string)",
                "function decimals() view returns (uint8)",
                "function totalSupply() view returns (uint256)",
                "function balanceOf(address) view returns (uint256)"
            ];
            showNotification('⚠️ 使用备用合约配置', 'warning');
        }

        hideLoading();
    } catch (error) {
        console.error('加载合约信息失败:', error);
        hideLoading();
        showNotification('⚠️ 无法加载合约配置', 'warning');
    }
}

// 初始化事件监听
function initEventListeners() {
    const connectBtn = document.getElementById('connect-wallet');
    connectBtn.addEventListener('click', connectWallet);

    const deployBtn = document.getElementById('deploy-token');
    deployBtn.addEventListener('click', deployToken);

    const createNewBtn = document.getElementById('create-new');
    createNewBtn.addEventListener('click', resetForm);

    const networkSelect = document.getElementById('network-select');
    networkSelect.addEventListener('change', () => updateNetworkInfo(true));

    addWalletSwitchButton();
    addRefreshNetworkButton(); // 新增：添加刷新网络按钮
}

// 添加钱包切换按钮
function addWalletSwitchButton() {
    const walletSection = document.querySelector('.wallet-section');
    const existingSwitchBtn = document.getElementById('switch-wallet');

    if (!existingSwitchBtn) {
        const switchBtn = document.createElement('button');
        switchBtn.id = 'switch-wallet';
        switchBtn.className = 'btn btn-secondary';
        switchBtn.textContent = '🔄 切换钱包';
        switchBtn.style.marginLeft = '10px';
        switchBtn.style.display = 'none';
        switchBtn.addEventListener('click', switchWallet);

        const connectBtn = document.getElementById('connect-wallet');
        connectBtn.parentNode.insertBefore(switchBtn, connectBtn.nextSibling);
    }
}

// 新增：添加手动刷新网络按钮
function addRefreshNetworkButton() {
    const networkInfoEl = document.getElementById('network-info');
    const existingBtn = document.getElementById('refresh-network');

    if (!existingBtn && networkInfoEl) {
        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'refresh-network';
        refreshBtn.textContent = '🔄 刷新网络';
        refreshBtn.style.cssText = `
            margin-left: 10px;
            padding: 2px 8px;
            font-size: 12px;
            border: none;
            border-radius: 3px;
            background: #17a2b8;
            color: white;
            cursor: pointer;
        `;
        refreshBtn.addEventListener('click', async () => {
            if (provider) {
                provider = new ethers.BrowserProvider(window.ethereum);
                await updateNetworkInfo(false);
                showNotification('🔄 已刷新网络状态', 'info');
            }
        });
        networkInfoEl.appendChild(refreshBtn);
    }
}

// 切换钱包
async function switchWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('请先安装 MetaMask!');
        return;
    }

    try {
        isConnecting = true;
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = accounts[0];

        const network = await provider.getNetwork();
        chainId = Number(network.chainId);

        showNotification(`✅ 已切换到账户: ${formatAddress(userAddress)}`, 'success');
        updateWalletUI();
        loadUserProjects(userAddress);
        isConnecting = false;

    } catch (error) {
        isConnecting = false;
        console.error('切换钱包失败:', error);
        // 仅在非用户取消时提示错误
        if (error.code !== 4001) {
            showNotification('❌ 切换钱包失败: ' + error.message, 'error');
        }
    }
}

// 检查钱包连接状态
async function checkWalletConnection() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            const accounts = await window.ethereum.request({method: 'eth_accounts'});
            if (accounts.length > 0) {
                await connectWallet(true); // 静默连接（不显示加载）
            } else {
                resetWalletState();
            }
        } catch (error) {
            console.error('检查钱包连接失败:', error);
            resetWalletState();
        }
    } else {
        showMetaMaskInstallPrompt();
    }
}

// 显示 MetaMask 安装提示
function showMetaMaskInstallPrompt() {
    const statusEl = document.getElementById('wallet-status');
    statusEl.textContent = '⚠️ 未检测到 MetaMask';
    statusEl.className = 'status-disconnected';

    const connectBtn = document.getElementById('connect-wallet');
    connectBtn.textContent = '安装 MetaMask';
    connectBtn.onclick = () => window.open('https://metamask.io/download.html', '_blank');
}

// 连接钱包（核心修复：添加静默连接参数+状态锁）
async function connectWallet(isSilent = false) {
    // 防止重复连接
    if (isConnecting) {
        showNotification('🔄 正在连接钱包中，请稍候', 'info');
        return;
    }

    if (typeof window.ethereum === 'undefined') {
        showMetaMaskInstallPrompt();
        return;
    }

    try {
        isConnecting = true;
        if (!isSilent) {
            showLoading('正在连接钱包...');
        }

        // 请求连接
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        // 初始化 provider 和 signer
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = accounts[0];

        // 获取网络信息
        const network = await provider.getNetwork();
        chainId = Number(network.chainId);

        // 获取账户余额
        const balance = await provider.getBalance(userAddress);
        const balanceInEth = ethers.formatEther(balance);

        walletConnected = true;

        // 更新UI
        updateWalletUI(balanceInEth);

        // 显示表单
        document.getElementById('token-form').style.display = 'block';

        // 监听账户和网络变化
        setupWalletListeners();

        // 加载该钱包的项目
        loadUserProjects(userAddress);

        if (!isSilent) {
            hideLoading();
            showNotification('✅ 钱包连接成功！', 'success');
        }

    } catch (error) {
        isConnecting = false; // 重置连接状态
        if (!isSilent) {
            hideLoading();
        }
        console.error('连接钱包失败:', error);

        // 核心修复：仅在非用户主动取消时提示错误
        if (error.code === 4001) {
            // 用户拒绝连接，友好提示而非错误
            showNotification('ℹ️ 您取消了钱包连接请求', 'info');
        } else if (error.code === -32002) {
            // MetaMask 正在处理请求，避免重复提示
            showNotification('🔄 MetaMask 正在处理请求，请稍候', 'info');
        } else {
            // 真正的连接错误才提示失败
            showNotification('❌ 连接钱包失败: ' + error.message, 'error');
        }
    }
}

// 更新钱包UI
function updateWalletUI(balanceInEth = '0') {
    const statusEl = document.getElementById('wallet-status');
    const shortAddress = formatAddress(userAddress);
    statusEl.innerHTML = `🟢 已连接: ${shortAddress} <br><small>余额: ${parseFloat(balanceInEth).toFixed(4)} ETH</small>`;
    statusEl.className = 'status-connected';

    const connectBtn = document.getElementById('connect-wallet');
    connectBtn.style.display = 'none';

    document.getElementById('deploy-token').disabled = false;

    updateNetworkInfo(false); // 禁用自动切换
}

// 格式化地址
function formatAddress(address) {
    if (!address) return '';
    return address.substring(0, 6) + '...' + address.substring(38);
}

// 更新网络信息（包含自动切换逻辑）
async function updateNetworkInfo(shouldAutoSwitch = true) {
    if (!provider) return;

    try {
        hideSwitchNetworkButton();

        const network = await provider.getNetwork();
        const currentChainId = Number(network.chainId);
        const networkName = getNetworkName(currentChainId);

        const selectedOption = document.getElementById('network-select').selectedOptions[0];
        const selectedChainId = parseInt(selectedOption.dataset.chainid);

        const networkInfo = document.getElementById('network-info');
        const deployBtn = document.getElementById('deploy-token');

        const isSupported = Object.values(supportedNetworks).some(n => n.chainId === currentChainId);

        if (!isSupported) {
            networkInfo.innerHTML = `⚠️ 当前网络: ${networkName} (${currentChainId})<br>
                                     <small style="color: #ff6b6b">不支持的网络，请切换到支持的网络</small>`;
            networkInfo.style.color = '#ff6b6b';
            deployBtn.disabled = true;
            showSupportedNetworksPrompt();
        } else if (currentChainId !== selectedChainId) {
            networkInfo.innerHTML = `🔄 准备切换到 ${selectedOption.text}...`;
            networkInfo.style.color = '#17a2b8';
            deployBtn.disabled = true;

            if (shouldAutoSwitch) {
                try {
                    await switchNetwork(selectedChainId);
                    const newNetwork = await provider.getNetwork();
                    const newChainId = Number(newNetwork.chainId);

                    if (newChainId === selectedChainId) {
                        networkInfo.innerHTML = `✅ 当前网络: ${getNetworkName(newChainId)}`;
                        networkInfo.style.color = '#28a745';
                        deployBtn.disabled = false;
                    } else {
                        throw new Error('切换未生效');
                    }
                } catch (switchError) {
                    console.error('自动切换网络失败:', switchError);
                    networkInfo.innerHTML = `⚠️ 当前网络: ${networkName} (${currentChainId})<br>
                                             <small style="color: #ff6b6b">请切换到 ${selectedOption.text}</small>`;
                    networkInfo.style.color = '#ff6b6b';
                    showSwitchNetworkButton(selectedChainId);
                }
            } else {
                networkInfo.innerHTML = `⚠️ 当前网络: ${networkName} (${currentChainId})<br>
                                         <small style="color: #ff6b6b">请切换到 ${selectedOption.text}</small>`;
                networkInfo.style.color = '#ff6b6b';
                showSwitchNetworkButton(selectedChainId);
            }
        } else {
            networkInfo.innerHTML = `✅ 当前网络: ${networkName}`;
            networkInfo.style.color = '#28a745';
            deployBtn.disabled = false;
        }
    } catch (error) {
        console.error('更新网络信息失败:', error);
        hideLoading();
        showNotification('❌ 网络状态检测失败，请刷新页面', 'error');
    }
}

// 支持的网络配置
const supportedNetworks = {
    sepolia: {
        chainId: 11155111,
        name: 'Sepolia 测试网',
        rpcUrl: 'https://sepolia.infura.io/v3/',
        explorer: 'https://sepolia.etherscan.io',
        currency: 'SepoliaETH'
    },
    goerli: {
        chainId: 5,
        name: 'Goerli 测试网',
        rpcUrl: 'https://goerli.infura.io/v3/',
        explorer: 'https://goerli.etherscan.io',
        currency: 'GoerliETH'
    },
    mainnet: {
        chainId: 1,
        name: 'Ethereum 主网',
        rpcUrl: 'https://mainnet.infura.io/v3/',
        explorer: 'https://etherscan.io',
        currency: 'ETH'
    }
};

// 显示切换网络按钮
function showSwitchNetworkButton(targetChainId) {
    let switchBtn = document.getElementById('switch-network-btn');

    if (!switchBtn) {
        switchBtn = document.createElement('button');
        switchBtn.id = 'switch-network-btn';
        switchBtn.className = 'btn btn-small';
        switchBtn.style.marginTop = '10px';
        switchBtn.style.padding = '5px 10px';
        switchBtn.style.fontSize = '14px';

        const networkInfo = document.getElementById('network-info');
        networkInfo.appendChild(document.createElement('br'));
        networkInfo.appendChild(switchBtn);
    }

    const targetNetwork = Object.values(supportedNetworks).find(n => n.chainId === targetChainId);
    switchBtn.textContent = `🔄 切换到 ${targetNetwork.name}`;
    switchBtn.onclick = () => switchNetwork(targetChainId);
    switchBtn.style.display = 'inline-block';
}

// 隐藏切换网络按钮
function hideSwitchNetworkButton() {
    const switchBtn = document.getElementById('switch-network-btn');
    if (switchBtn) {
        switchBtn.style.display = 'none';
    }
}

// 切换网络（优化失败处理）
async function switchNetwork(targetChainId) {
    if (!window.ethereum) return;

    try {
        showLoading(`正在切换到 ${getNetworkName(targetChainId)}...`);
        provider = new ethers.BrowserProvider(window.ethereum);

        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{chainId: '0x' + targetChainId.toString(16)}],
        });

        setTimeout(async () => {
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();

            const actualNetwork = await provider.getNetwork();
            const actualChainId = Number(actualNetwork.chainId);

            if (actualChainId === targetChainId) {
                await updateNetworkInfo(false);
                hideLoading();
                showNotification(`✅ 已切换到 ${getNetworkName(targetChainId)}`, 'success');
            } else {
                hideLoading();
                showNotification(`⚠️ 网络切换未生效，请手动在MetaMask中切换`, 'warning');
                await updateNetworkInfo(false);
            }
        }, 1500);

    } catch (switchError) {
        hideLoading();
        provider = new ethers.BrowserProvider(window.ethereum);
        await updateNetworkInfo(false);

        if (switchError.code === 4902) {
            try {
                await addNetwork(targetChainId);
            } catch (addError) {
                showNotification('❌ 添加网络失败，请手动添加', 'error');
            }
        } else if (switchError.code === 4001) {
            showNotification('❌ 您拒绝了网络切换请求', 'error');
        } else {
            showNotification(`❌ 切换网络失败: ${switchError.message}`, 'error');
        }
        console.error('切换网络失败:', switchError);
    }
}

// 添加网络
async function addNetwork(chainId) {
    const network = Object.values(supportedNetworks).find(n => n.chainId === chainId);
    if (!network) return;

    try {
        await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
                chainId: '0x' + chainId.toString(16),
                chainName: network.name,
                rpcUrls: [network.rpcUrl],
                nativeCurrency: {
                    name: network.currency,
                    symbol: network.currency,
                    decimals: 18
                },
                blockExplorerUrls: [network.explorer]
            }],
        });

        showNotification(`✅ 已添加 ${network.name}`, 'success');
    } catch (error) {
        console.error('添加网络失败:', error);
        throw error;
    }
}

// 获取网络名称
function getNetworkName(chainId) {
    const networks = {
        1: 'Ethereum 主网',
        5: 'Goerli 测试网',
        11155111: 'Sepolia 测试网',
        137: 'Polygon',
        56: 'BSC'
    };
    return networks[chainId] || `未知网络 (${chainId})`;
}

// 新增：显示支持的网络提示
function showSupportedNetworksPrompt() {
    const supportedList = Object.values(supportedNetworks).map(n => n.name).join('、');
    showNotification(`⚠️ 请切换到支持的网络：${supportedList}`, 'warning');
}

// 设置钱包监听器
function setupWalletListeners() {
    window.ethereum.removeAllListeners('accountsChanged');
    window.ethereum.removeAllListeners('chainChanged');
    window.ethereum.removeAllListeners('disconnect');

    // 监听账户变化
    window.ethereum.on('accountsChanged', async (accounts) => {
        console.log('账户变化:', accounts);

        if (accounts.length === 0) {
            showNotification('🔌 钱包已断开连接', 'info');
            resetWalletState();
        } else {
            userAddress = accounts[0];
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();

            const balance = await provider.getBalance(userAddress);
            const balanceInEth = ethers.formatEther(balance);

            updateWalletUI(balanceInEth);
            loadUserProjects(userAddress);

            showNotification(`🔄 已切换到账户: ${formatAddress(userAddress)}`, 'success');
        }
    });

    // 监听网络变化（修复核心）
    window.ethereum.on('chainChanged', (newChainId) => {
        console.log('网络变化:', newChainId);
        chainId = parseInt(newChainId, 16);

        setTimeout(async () => {
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            await updateNetworkInfo(false);

            const networkName = getNetworkName(chainId);
            showNotification(`🔄 网络已切换到 ${networkName}`, 'info');
        }, 1500);
    });

    // 监听断开连接
    window.ethereum.on('disconnect', (error) => {
        console.log('钱包断开连接:', error);
        resetWalletState();
        showNotification('🔌 钱包连接已断开', 'info');
    });
}

// 重置钱包状态
function resetWalletState() {
    userAddress = null;
    provider = null;
    signer = null;
    walletConnected = false;
    isConnecting = false; // 重置连接状态

    const statusEl = document.getElementById('wallet-status');
    statusEl.textContent = '🔴 未连接钱包';
    statusEl.className = 'status-disconnected';

    const connectBtn = document.getElementById('connect-wallet');
    connectBtn.textContent = '连接 MetaMask';
    connectBtn.onclick = connectWallet;
    connectBtn.style.display = 'block';

    document.getElementById('switch-wallet').style.display = 'none';
    document.getElementById('token-form').style.display = 'none';
    document.getElementById('deploy-token').disabled = true;
    document.getElementById('network-info').innerHTML = '';


    hideSwitchNetworkButton();
}

// 加载用户的项目
async function loadUserProjects(walletAddress) {
    const projectsList = document.getElementById('projects-list');

    try {
        const response = await fetch(`${API_BASE_URL}/projects?wallet=${walletAddress}`);
        const projects = await response.json();

        if (projects.length === 0) {
            projectsList.innerHTML = '<p class="loading">您还没有创建过代币</p>';
            return;
        }

        projectsList.innerHTML = projects.map(project => `
            <div class="project-item" onclick="showProjectDetails(${project.id})">
                <div class="token-name">${project.token_name} (${project.token_symbol})</div>
                <div class="details">
                    <div>📅 ${new Date(project.created_at).toLocaleString()}</div>
                    <div>🔗 ${project.contract_address ?
            `<span class="contract-address" onclick="copyToClipboard('${project.contract_address}'); event.stopPropagation();">
                            📋 ${formatAddress(project.contract_address)}
                         </span>` :
            '⏳ 部署中...'}</div>
                    <div>💰 发行量: ${project.initial_supply}</div>
                    <div>🌐 ${project.chain}</div>
                </div>
                ${project.contract_address ? `
                    <div class="project-actions">
                        <button class="btn-small" onclick="viewOnExplorer('${project.contract_address}', '${project.chain}'); event.stopPropagation();">
                            🔍 查看
                        </button>
                        <button class="btn-small" onclick="copyToClipboard('${project.contract_address}'); event.stopPropagation();">
                            📋 复制地址
                        </button>
                    </div>
                ` : ''}
            </div>
        `).join('');

    } catch (error) {
        console.error('加载用户项目失败:', error);
        projectsList.innerHTML = '<p class="loading">加载失败，请刷新页面</p>';
    }
}

// 显示项目详情
async function showProjectDetails(projectId) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects/${projectId}`);
        const project = await response.json();
        showProjectModal(project);
    } catch (error) {
        console.error('获取项目详情失败:', error);
        showNotification('❌ 获取项目详情失败', 'error');
    }
}

// 显示项目详情模态框
function showProjectModal(project) {
    const modalHtml = `
        <div class="modal" id="project-modal">
            <div class="modal-content">
                <span class="close" onclick="closeModal()">&times;</span>
                <h2>${project.token_name} (${project.token_symbol})</h2>
                <div class="modal-body">
                    <p><strong>合约地址:</strong> ${project.contract_address || '未部署'}</p>
                    <p><strong>部署者:</strong> ${project.deployer_address || project.wallet_address}</p>
                    <p><strong>发行量:</strong> ${project.initial_supply}</p>
                    <p><strong>精度:</strong> ${project.decimals}</p>
                    <p><strong>网络:</strong> ${project.chain}</p>
                    <p><strong>交易哈希:</strong> ${project.tx_hash || '无'}</p>
                    <p><strong>创建时间:</strong> ${new Date(project.created_at).toLocaleString()}</p>
                    <p><strong>功能:</strong> ${JSON.stringify(JSON.parse(project.features || '{}'))}</p>
                </div>
                <div class="modal-footer">
                    <button onclick="copyToClipboard('${project.contract_address}')">复制地址</button>
                    <button onclick="viewOnExplorer('${project.contract_address}', '${project.chain}')">在浏览器中查看</button>
                </div>
            </div>
        </div>
    `;

    const existingModal = document.getElementById('project-modal');
    if (existingModal) {
        existingModal.remove();
    }

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('project-modal').style.display = 'block';
}

// 关闭模态框
function closeModal() {
    const modal = document.getElementById('project-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 在区块浏览器中查看
function viewOnExplorer(address, chain) {
    const explorers = {
        sepolia: 'https://sepolia.etherscan.io/address/',
        goerli: 'https://goerli.etherscan.io/address/',
        mainnet: 'https://etherscan.io/address/',
        polygon: 'https://polygonscan.com/address/',
        bsc: 'https://bscscan.com/address/'
    };

    const url = explorers[chain] + address;
    window.open(url, '_blank');
}

// 加载最近项目
async function loadRecentProjects() {
    const projectsList = document.getElementById('projects-list');

    try {
        const response = await fetch(`${API_BASE_URL}/projects`);
        const projects = await response.json();

        if (projects.length === 0) {
            projectsList.innerHTML = '<p class="loading">暂无创建的项目</p>';
            return;
        }

        projectsList.innerHTML = projects.map(project => `
            <div class="project-item">
                <div class="token-name">${project.token_name} (${project.token_symbol})</div>
                <div class="details">
                    <div>👤 ${formatAddress(project.wallet_address)}</div>
                    <div>📅 ${new Date(project.created_at).toLocaleString()}</div>
                    <div>🔗 ${project.contract_address ?
            formatAddress(project.contract_address) :
            '⏳ 部署中...'}</div>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('加载项目列表失败:', error);
        projectsList.innerHTML = '<p class="loading">加载失败，请刷新页面</p>';
    }
}

// 显示加载状态
function showLoading(message = '加载中...') {
    let loadingEl = document.getElementById('loading-overlay');

    if (!loadingEl) {
        loadingEl = document.createElement('div');
        loadingEl.id = 'loading-overlay';
        loadingEl.innerHTML = `
            <div class="loading-spinner"></div>
            <div class="loading-message"></div>
        `;
        document.body.appendChild(loadingEl);

        const style = document.createElement('style');
        style.textContent = `
            #loading-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 9999;
            }
            .loading-spinner {
                width: 50px;
                height: 50px;
                border: 5px solid #f3f3f3;
                border-top: 5px solid #667eea;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            .loading-message {
                margin-top: 20px;
                color: white;
                font-size: 18px;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    loadingEl.querySelector('.loading-message').textContent = message;
    loadingEl.style.display = 'flex';
}

// 隐藏加载状态
function hideLoading() {
    const loadingEl = document.getElementById('loading-overlay');
    if (loadingEl) {
        loadingEl.style.display = 'none';
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;

    const colors = {
        success: '#28a745',
        error: '#dc3545',
        info: '#17a2b8',
        warning: '#ffc107'
    };
    notification.style.backgroundColor = colors[type] || colors.info;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// 复制到剪贴板
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('✅ 已复制到剪贴板', 'success');
    }).catch(() => {
        showNotification('❌ 复制失败', 'error');
    });
}

// 部署代币
async function deployToken() {
    if (!signer) {
        alert('请先连接钱包');
        return;
    }

    if (!contractInfoLoaded || !CONTRACT_BYTECODE || CONTRACT_BYTECODE === '0x') {
        showNotification('❌ 合约配置未加载，请刷新页面重试', 'error');
        return;
    }

    const tokenName = document.getElementById('token-name').value;
    const tokenSymbol = document.getElementById('token-symbol').value;
    const initialSupply = document.getElementById('initial-supply').value;
    const decimals = parseInt(document.getElementById('decimals').value);

    if (!tokenName || !tokenSymbol || !initialSupply) {
        alert('请填写所有必填字段');
        return;
    }

    const features = {
        mintable: document.getElementById('mintable').checked,
        burnable: document.getElementById('burnable').checked,
        pausable: document.getElementById('pausable').checked,
        permit: document.getElementById('permit').checked
    };

    const selectedNetwork = document.getElementById('network-select').value;
    const selectedChainId = parseInt(document.getElementById('network-select').selectedOptions[0].dataset.chainid);

    if (chainId !== selectedChainId) {
        alert(`请先在 MetaMask 中切换到 ${document.getElementById('network-select').selectedOptions[0].text}`);
        return;
    }

    try {
        document.getElementById('status-section').style.display = 'block';
        document.getElementById('token-form').style.display = 'none';

        updateStep('step-prepare', true);

        const supplyWithDecimals = ethers.parseUnits(initialSupply, decimals);

        updateStep('step-sign', true);

        const factory = new ethers.ContractFactory(
            CONTRACT_ABI,
            CONTRACT_BYTECODE,
            signer
        );

        updateStep('step-prepare', false, true);

        const contract = await factory.deploy(
            tokenName,
            tokenSymbol,
            supplyWithDecimals,
            userAddress,
            features.mintable,
            features.burnable,
            features.pausable,
            features.permit
        );
        updateStep('step-deploy', true);

        document.getElementById('tx-hash').textContent = contract.deploymentTransaction().hash;
        updateExplorerLink(contract.deploymentTransaction().hash);

        updateStep('step-sign', false, true);
        updateStep('step-deploy', false, true);
        updateStep('step-confirm', true);

        await contract.waitForDeployment();

        const contractAddress = await contract.getAddress();
        document.getElementById('contract-address').textContent = contractAddress;
        document.getElementById('contract-address').href = `https://${selectedNetwork}.etherscan.io/address/${contractAddress}`;

        updateStep('step-confirm', false, true);

        await saveProjectToBackend({
            wallet_address: userAddress,
            token_name: tokenName,
            token_symbol: tokenSymbol,
            initial_supply: initialSupply,
            decimals: decimals,
            features: features,
            chain: selectedNetwork,
            chain_id: selectedChainId,
            contract_address: contractAddress,
            tx_hash: contract.deploymentTransaction().hash,
            deployer_address: userAddress
        });

        loadRecentProjects();
        showNotification('✅ 代币部署成功！', 'success');

    } catch (error) {
        console.error('部署失败:', error);
        showNotification('❌ 部署失败: ' + error.message, 'error');

        document.getElementById('status-section').style.display = 'none';
        document.getElementById('token-form').style.display = 'block';
    }
}

// 更新步骤状态
function updateStep(stepId, isActive = false, isCompleted = false) {
    const step = document.getElementById(stepId);
    step.classList.remove('active', 'completed');

    if (isActive) {
        step.classList.add('active');
    }
    if (isCompleted) {
        step.classList.add('completed');
    }
}

// 更新区块浏览器链接
function updateExplorerLink(txHash) {
    const link = document.getElementById('explorer-link');
    const network = document.getElementById('network-select').value;

    const explorers = {
        sepolia: 'https://sepolia.etherscan.io/tx/',
        goerli: 'https://goerli.etherscan.io/tx/',
        mainnet: 'https://etherscan.io/tx/',
        polygon: 'https://polygonscan.com/tx/',
        bsc: 'https://bscscan.com/tx/'
    };

    link.href = explorers[network] + txHash;
}

// 保存项目到后端
async function saveProjectToBackend(projectData) {
    try {
        const response = await fetch(`${API_BASE_URL}/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(projectData)
        });

        if (!response.ok) {
            throw new Error('保存失败');
        }

        const data = await response.json();
        currentProjectId = data.project.id;

    } catch (error) {
        console.error('保存到后端失败:', error);
    }
}

// 重置表单
function resetForm() {
    document.getElementById('status-section').style.display = 'none';
    document.getElementById('token-form').style.display = 'block';

    ['step-prepare', 'step-sign', 'step-deploy', 'step-confirm'].forEach(stepId => {
        document.getElementById(stepId).classList.remove('active', 'completed');
    });

    document.getElementById('tx-hash').textContent = '-';
    document.getElementById('contract-address').textContent = '-';
}