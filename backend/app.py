import json
import os
import subprocess
from pathlib import Path
from datetime import datetime

from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS

from database import db, Project

import os
import json
import subprocess
from datetime import datetime

# 加载环境变量
load_dotenv()

# 创建Flask应用
app = Flask(__name__)
CORS(app)  # 允许跨域请求

# 合约文件路径
CONTRACT_PATH = os.path.join(os.path.dirname(__file__), 'contract_template.sol')
COMPILED_DIR = os.path.join(os.path.dirname(__file__), 'compiled')

# 确保编译目录存在
os.makedirs(COMPILED_DIR, exist_ok=True)

# 配置数据库
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///createmycoin.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

# 创建数据库表
with app.app_context():
    db.create_all()
    print("✅ 数据库初始化完成")


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'ok',
        'message': 'CreateMyCoin API is running'
    })


@app.route('/api/projects', methods=['POST'])
def create_project():
    """创建新项目记录"""
    try:
        data = request.json

        # 验证必要字段
        required_fields = ['wallet_address', 'token_name', 'token_symbol', 'initial_supply']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # 创建项目记录
        project = Project(
            wallet_address=data['wallet_address'],
            token_name=data['token_name'],
            token_symbol=data['token_symbol'],
            initial_supply=str(data['initial_supply']),
            decimals=data.get('decimals', 18),
            features=json.dumps(data.get('features', {})),
            chain=data.get('chain', 'sepolia'),
            chain_id=data.get('chain_id', 11155111),
            contract_address=data.get('contract_address'),
            tx_hash=data.get('tx_hash'),
            deployer_address=data.get('deployer_address', data['wallet_address'])
        )

        project.save()

        return jsonify({
            'success': True,
            'message': 'Project created successfully',
            'project': project.to_dict()
        }), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/projects/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    """更新项目信息（如合约地址、交易哈希）"""
    try:
        project = Project.query.get(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        data = request.json

        # 更新字段
        if 'contract_address' in data:
            project.contract_address = data['contract_address']
        if 'tx_hash' in data:
            project.tx_hash = data['tx_hash']
        if 'chain' in data:
            project.chain = data['chain']
        if 'chain_id' in data:
            project.chain_id = data['chain_id']

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Project updated successfully',
            'project': project.to_dict()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/projects/<int:project_id>', methods=['GET'])
def get_project(project_id):
    """获取单个项目信息"""
    try:
        project = Project.query.get(project_id)
        if not project:
            return jsonify({'error': 'Project not found'}), 404

        return jsonify(project.to_dict())

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/projects', methods=['GET'])
def list_projects():
    """获取项目列表，支持按钱包地址过滤"""
    try:
        wallet = request.args.get('wallet')

        if wallet:
            projects = Project.query.filter_by(wallet_address=wallet).order_by(Project.created_at.desc()).all()
        else:
            projects = Project.query.order_by(Project.created_at.desc()).limit(50).all()

        return jsonify([p.to_dict() for p in projects])

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """获取平台统计信息"""
    try:
        total_projects = Project.query.count()
        unique_wallets = db.session.query(Project.wallet_address).distinct().count()

        # 按链统计
        chain_stats = db.session.query(
            Project.chain, db.func.count(Project.id)
        ).group_by(Project.chain).all()

        return jsonify({
            'total_projects': total_projects,
            'unique_wallets': unique_wallets,
            'chain_stats': dict(chain_stats)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def compile_contract():
    """编译合约，返回字节码和ABI（指定solc.exe绝对路径版本）"""
    try:
        # ========== 核心修改：指定solc.exe的绝对路径 ==========
        # 替换为你实际的solc.exe路径，示例路径仅供参考
        SOLC_EXE_PATH = r"D:\Git\github\createmycoin\createmycoin\backend\solc.exe"

        # ========== 原有路径配置（保留） ==========
        # 合约文件路径（根据你的项目结构调整，确保路径正确）
        CONTRACT_PATH = os.path.join(os.path.dirname(__file__), 'contract_template.sol')
        # 编译输出目录
        COMPILED_DIR = os.path.join(os.path.dirname(__file__), 'compiled')
        # 确保编译目录存在
        os.makedirs(COMPILED_DIR, exist_ok=True)

        # 查找 node_modules 路径（OpenZeppelin库）
        base_dir = os.path.dirname(os.path.dirname(__file__))  # 项目根目录
        node_modules_path = os.path.join(base_dir, 'node_modules')

        # ========== 检查solc.exe是否存在 ==========
        if not os.path.exists(SOLC_EXE_PATH):
            print(f"❌ 找不到solc.exe，请检查路径：{SOLC_EXE_PATH}")
            return None

        # ========== 构建编译命令（使用指定的solc.exe路径） ==========
        cmd = [
            SOLC_EXE_PATH,  # 关键：替换为solc.exe绝对路径，不再用系统的solc命令
            '--bin',
            '--abi',
            '--optimize',
            '--overwrite',
            '--include-path', node_modules_path,  # 添加OpenZeppelin库路径
            '--base-path', base_dir,  # 基础路径
            '-o', COMPILED_DIR,
            CONTRACT_PATH
        ]

        # 执行编译命令
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"编译错误: {result.stderr}")
            return None

        # ========== 读取编译结果（原有逻辑保留） ==========
        contract_name = "CreateMyCoinToken"
        bin_file = os.path.join(COMPILED_DIR, f"{contract_name}.bin")
        abi_file = os.path.join(COMPILED_DIR, f"{contract_name}.abi")

        if os.path.exists(bin_file) and os.path.exists(abi_file):
            with open(bin_file, 'r') as f:
                bytecode = '0x' + f.read().strip()
            with open(abi_file, 'r') as f:
                abi = json.load(f)

            contract_info = {
                'bytecode': bytecode,
                'abi': abi,
                'contractName': contract_name,
                'compilerVersion': 'v0.8.20',
                'updatedAt': datetime.now().isoformat()
            }

            with open(os.path.join(COMPILED_DIR, 'contract_info.json'), 'w') as f:
                json.dump(contract_info, f, indent=2)

            print("✅ 合约编译成功！")
            return contract_info
        else:
            print("❌ 编译文件未生成")
            return None

    except Exception as e:
        print(f"编译错误: {e}")
        return None


def compile_contract1():
    """编译合约，返回字节码和ABI"""
    try:
        # 获取 OpenZeppelin 库的路径
        import subprocess
        import json

        # 查找 node_modules 路径
        base_dir = os.path.dirname(os.path.dirname(__file__))  # 项目根目录
        node_modules_path = os.path.join(base_dir, 'node_modules')

        # 方法1：使用命令行编译，指定库路径
        cmd = [
            'solc',
            '--bin',
            '--abi',
            '--optimize',
            '--overwrite',
            '--include-path', node_modules_path,  # 添加库路径
            '--base-path', base_dir,  # 基础路径
            '-o', COMPILED_DIR,
            CONTRACT_PATH
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"编译错误: {result.stderr}")
            return None

        # 读取编译结果
        contract_name = "CreateMyCoinToken"
        bin_file = os.path.join(COMPILED_DIR, f"{contract_name}.bin")
        abi_file = os.path.join(COMPILED_DIR, f"{contract_name}.abi")

        if os.path.exists(bin_file) and os.path.exists(abi_file):
            with open(bin_file, 'r') as f:
                bytecode = '0x' + f.read().strip()
            with open(abi_file, 'r') as f:
                abi = json.load(f)

            contract_info = {
                'bytecode': bytecode,
                'abi': abi,
                'contractName': contract_name,
                'compilerVersion': 'v0.8.20',
                'updatedAt': datetime.now().isoformat()
            }

            with open(os.path.join(COMPILED_DIR, 'contract_info.json'), 'w') as f:
                json.dump(contract_info, f, indent=2)

            print("✅ 合约编译成功！")
            return contract_info
        else:
            print("❌ 编译文件未生成")
            return None

    except Exception as e:
        print(f"编译错误: {e}")
        return None


def get_cached_contract_info():
    """获取缓存的合约信息"""
    cache_file = os.path.join(COMPILED_DIR, 'contract_info.json')
    if os.path.exists(cache_file):
        with open(cache_file, 'r') as f:
            return json.load(f)
    return None


# 在应用启动时尝试编译合约
with app.app_context():
    contract_info = get_cached_contract_info()
    if not contract_info:
        print("🔄 正在编译合约...")
        contract_info = compile_contract()
        if contract_info:
            print("✅ 合约编译成功！")
        else:
            print("⚠️ 请确保已安装 solc: npm install -g solc")
    else:
        print("✅ 使用缓存的合约信息")


# 添加合约信息接口
@app.route('/api/contract-info', methods=['GET'])
def get_contract_info():
    """提供合约的ABI和字节码"""
    try:
        # 尝试从缓存获取
        contract_info = get_cached_contract_info()

        # 如果没有缓存，重新编译
        if not contract_info:
            contract_info = compile_contract()

        if contract_info:
            return jsonify({
                'success': True,
                'data': contract_info
            })
        else:
            # 如果编译失败，返回默认的OpenZeppelin标准ERC20信息
            default_info = {
                'bytecode': '',  # 这里不能为空，需要从标准库获取
                'abi': [],  # 这里需要标准ERC20的ABI
                'contractName': 'ERC20',
                'compilerVersion': 'v0.8.20'
            }
            return jsonify({
                'success': False,
                'error': '合约编译失败，请确保已安装solc',
                'data': default_info
            }), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# 添加编译状态检查接口
@app.route('/api/contract-compile', methods=['POST'])
def compile_contract_api():
    """手动触发合约编译"""
    try:
        contract_info = compile_contract()
        if contract_info:
            return jsonify({
                'success': True,
                'message': '合约编译成功',
                'data': contract_info
            })
        else:
            return jsonify({
                'success': False,
                'error': '编译失败，请检查solc是否安装'
            }), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
