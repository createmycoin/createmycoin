// ============================================================================
// 全局变量
let provider;
let signer;
let userAddress;
let chainId;
let currentProjectId = null;
let walletConnected = false;

// API 基础URL
const API_BASE_URL = 'http://localhost:5000/api';

// 合约字节码（实际项目中应该从编译后的文件获取）
const CONTRACT_BYTECODE = "0x"; // 实际部署时需要替换

// 合约ABI（简化版）
const CONTRACT_ABI = [
    "constructor(string name, string symbol, uint256 initialSupply, address owner, bool mintable, bool burnable, bool pausable, bool permit)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function mint(address to, uint256 amount)",
    "function burn(uint256 amount)",
    "function pause()",
    "function unpause()",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    checkWalletConnection();
    loadRecentProjects();

    // 定期刷新最近项目
    setInterval(loadRecentProjects, 30000); // 每30秒刷新一次
});

// 初始化事件监听
function initEventListeners() {
    const connectBtn = document.getElementById('connect-wallet');
    connectBtn.addEventListener('click', connectWallet);

    const deployBtn = document.getElementById('deploy-token');
    deployBtn.addEventListener('click', deployToken);

    const createNewBtn = document.getElementById('create-new');
    createNewBtn.addEventListener('click', resetForm);

    const networkSelect = document.getElementById('network-select');
    networkSelect.addEventListener('change', updateNetworkInfo);

    // 添加钱包切换按钮
    addWalletSwitchButton();
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

        // 插入到连接按钮后面
        const connectBtn = document.getElementById('connect-wallet');
        connectBtn.parentNode.insertBefore(switchBtn, connectBtn.nextSibling);
    }
}

// 切换钱包
async function switchWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('请先安装 MetaMask!');
        return;
    }

    try {
        // 请求连接，MetaMask 会弹出账户选择界面
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        // 更新 provider 和 signer
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        userAddress = accounts[0];

        // 获取网络信息
        const network = await provider.getNetwork();
        chainId = Number(network.chainId);

        // 显示切换成功的提示
        showNotification(`✅ 已切换到账户: ${formatAddress(userAddress)}`, 'success');

        // 更新UI
        updateWalletUI();

        // 重新加载该钱包的项目
        loadUserProjects(userAddress);

    } catch (error) {
        console.error('切换钱包失败:', error);
        showNotification('❌ 切换钱包失败: ' + error.message, 'error');
    }
}

// 检查钱包连接状态
async function checkWalletConnection() {
    if (typeof window.ethereum !== 'undefined') {
        try {
            const accounts = await window.ethereum.request({method: 'eth_accounts'});
            if (accounts.length > 0) {
                await connectWallet();
            } else {
                // 没有连接的钱包，显示断开状态
                resetWalletState();
            }
        } catch (error) {
            console.error('检查钱包连接失败:', error);
            resetWalletState();
        }
    } else {
        // 没有安装 MetaMask
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

// 连接钱包
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        showMetaMaskInstallPrompt();
        return;
    }

    try {
        // 显示加载状态
        showLoading('正在连接钱包...');

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

        // 显示切换按钮
        // document.getElementById('switch-wallet').style.display = 'inline-block';

        // 监听账户和网络变化
        setupWalletListeners();

        // 加载该钱包的项目
        loadUserProjects(userAddress);

        // 隐藏加载状态
        hideLoading();

        showNotification('✅ 钱包连接成功！', 'success');

    } catch (error) {
        hideLoading();
        console.error('连接钱包失败:', error);

        if (error.code === 4001) {
            // 用户拒绝了连接请求
            showNotification('❌ 您拒绝了连接请求', 'error');
        } else {
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

    updateNetworkInfo();
}

// 格式化地址
function formatAddress(address) {
    if (!address) return '';
    return address.substring(0, 6) + '...' + address.substring(38);
}

// 更新网络信息
async function updateNetworkInfo() {
    if (!provider) return;

    try {
        const network = await provider.getNetwork();
        const currentChainId = Number(network.chainId);
        const networkName = getNetworkName(currentChainId);

        const selectedOption = document.getElementById('network-select').selectedOptions[0];
        const selectedChainId = parseInt(selectedOption.dataset.chainid);

        const networkInfo = document.getElementById('network-info');
        const deployBtn = document.getElementById('deploy-token');

        // 检查是否支持当前网络
        const isSupported = Object.values(supportedNetworks).some(n => n.chainId === currentChainId);

        if (!isSupported) {
            networkInfo.innerHTML = `⚠️ 当前网络: ${networkName} (${currentChainId})<br>
                                     <small style="color: #ff6b6b">不支持的网络，请切换到支持的网络</small>`;
            networkInfo.style.color = '#ff6b6b';
            deployBtn.disabled = true;
            showNetworkSwitchPrompt(currentChainId);
        } else if (currentChainId !== selectedChainId) {
            networkInfo.innerHTML = `⚠️ 当前网络: ${networkName} (${currentChainId})<br>
                                     <small style="color: #ff6b6b">请切换到 ${selectedOption.text}</small>`;
            networkInfo.style.color = '#ff6b6b';
            deployBtn.disabled = true;

            // 显示切换网络按钮
            showSwitchNetworkButton(selectedChainId);
        } else {
            networkInfo.innerHTML = `✅ 当前网络: ${networkName}`;
            networkInfo.style.color = '#28a745';
            deployBtn.disabled = false;
            hideSwitchNetworkButton();
        }
    } catch (error) {
        console.error('更新网络信息失败:', error);
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

// 切换网络
async function switchNetwork(targetChainId) {
    if (!window.ethereum) return;

    try {
        showLoading(`正在切换到 ${getNetworkName(targetChainId)}...`);

        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{chainId: '0x' + targetChainId.toString(16)}],
        });

        // 网络切换后，等待一下让provider更新
        setTimeout(async () => {
            await updateNetworkInfo();
            hideLoading();
            showNotification(`✅ 已切换到 ${getNetworkName(targetChainId)}`, 'success');
        }, 1000);

    } catch (switchError) {
        // 如果网络不存在，尝试添加
        if (switchError.code === 4902) {
            try {
                await addNetwork(targetChainId);
            } catch (addError) {
                hideLoading();
                showNotification('❌ 添加网络失败', 'error');
            }
        } else {
            hideLoading();
            showNotification('❌ 切换网络失败', 'error');
        }
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

// 设置钱包监听器
function setupWalletListeners() {
    // 移除之前的监听器
    window.ethereum.removeAllListeners('accountsChanged');
    window.ethereum.removeAllListeners('chainChanged');
    window.ethereum.removeAllListeners('disconnect');

    // 监听账户变化
    window.ethereum.on('accountsChanged', async (accounts) => {
        console.log('账户变化:', accounts);

        if (accounts.length === 0) {
            // 用户断开了连接
            showNotification('🔌 钱包已断开连接', 'info');
            resetWalletState();
        } else {
            // 用户切换了账户
            userAddress = accounts[0];
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();

            // 获取新账户余额
            const balance = await provider.getBalance(userAddress);
            const balanceInEth = ethers.formatEther(balance);

            updateWalletUI(balanceInEth);
            loadUserProjects(userAddress);

            showNotification(`🔄 已切换到账户: ${formatAddress(userAddress)}`, 'success');
        }
    });

    // 监听网络变化
    window.ethereum.on('chainChanged', (newChainId) => {
        console.log('网络变化:', newChainId);
        chainId = parseInt(newChainId, 16);

        // 刷新页面或更新UI（推荐更新UI而不是刷新）
        setTimeout(async () => {
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            await updateNetworkInfo();

            const networkName = getNetworkName(chainId);
            showNotification(`🔄 网络已切换到 ${networkName}`, 'info');
        }, 1000);
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

    const statusEl = document.getElementById('wallet-status');
    statusEl.textContent = '🔴 未连接钱包';
    statusEl.className = 'status-disconnected';

    const connectBtn = document.getElementById('connect-wallet');
    connectBtn.textContent = '连接 MetaMask';
    connectBtn.onclick = connectWallet;

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

        // 创建模态框显示详细信息
        showProjectModal(project);
    } catch (error) {
        console.error('获取项目详情失败:', error);
        showNotification('❌ 获取项目详情失败', 'error');
    }
}

// 显示项目详情模态框
function showProjectModal(project) {
    // 创建模态框（简化版，实际可以使用现成的UI库）
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

    // 添加到页面
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

        // 添加样式
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
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // 添加样式
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

    // 根据类型设置颜色
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        info: '#17a2b8',
        warning: '#ffc107'
    };
    notification.style.backgroundColor = colors[type] || colors.info;

    // 添加动画样式
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

    // 3秒后移除
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

    // 获取表单数据
    const tokenName = document.getElementById('token-name').value;
    const tokenSymbol = document.getElementById('token-symbol').value;
    const initialSupply = document.getElementById('initial-supply').value;
    const decimals = parseInt(document.getElementById('decimals').value);

    // 验证
    if (!tokenName || !tokenSymbol || !initialSupply) {
        alert('请填写所有必填字段');
        return;
    }

    // 获取功能开关
    const features = {
        mintable: document.getElementById('mintable').checked,
        burnable: document.getElementById('burnable').checked,
        pausable: document.getElementById('pausable').checked,
        permit: document.getElementById('permit').checked
    };

    const selectedNetwork = document.getElementById('network-select').value;
    const selectedChainId = parseInt(document.getElementById('network-select').selectedOptions[0].dataset.chainid);

    // 检查网络
    if (chainId !== selectedChainId) {
        alert(`请先在 MetaMask 中切换到 ${document.getElementById('network-select').selectedOptions[0].text}`);
        return;
    }

    try {
        // 显示状态面板
        document.getElementById('status-section').style.display = 'block';
        document.getElementById('token-form').style.display = 'none';

        // 更新步骤
        updateStep('step-prepare', true);

        // 准备部署数据
        const supplyWithDecimals = ethers.parseUnits(initialSupply, decimals);

        // 创建合约工厂
        updateStep('step-sign', true);

        // 部署合约
        const factory = new ethers.ContractFactory(
            CONTRACT_ABI,
            CONTRACT_BYTECODE,
            signer
        );

        updateStep('step-prepare', false, true);
        updateStep('step-deploy', true);

        // 部署合约
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

        // 显示交易哈希
        document.getElementById('tx-hash').textContent = contract.deploymentTransaction().hash;
        updateExplorerLink(contract.deploymentTransaction().hash);

        updateStep('step-deploy', false, true);
        updateStep('step-confirm', true);

        // 等待部署完成
        await contract.waitForDeployment();


        // 获取合约地址
        const contractAddress = await contract.getAddress();
        document.getElementById('contract-address').textContent = contractAddress;


        // 更新步骤
        updateStep('step-confirm', false, true);

        // 保存到后端
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

        // 加载最近项目
        loadRecentProjects();

        // 显示成功信息
        showNotification('✅ 代币部署成功！', 'success');

    } catch (error) {
        console.error('部署失败:', error);
        showNotification('❌ 部署失败: ' + error.message, 'error');

        // 重置状态
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

    // 重置步骤状态
    ['step-prepare', 'step-sign', 'step-deploy', 'step-confirm'].forEach(stepId => {
        document.getElementById(stepId).classList.remove('active', 'completed');
    });

    // 清空结果
    document.getElementById('tx-hash').textContent = '-';
    document.getElementById('contract-address').textContent = '-';
}
