from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()


class Project(db.Model):
    """发币项目数据库模型"""
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True)
    wallet_address = db.Column(db.String(42), nullable=False, index=True)
    token_name = db.Column(db.String(100), nullable=False)
    token_symbol = db.Column(db.String(10), nullable=False)
    initial_supply = db.Column(db.String(78), nullable=False)  # 使用字符串存储大数
    decimals = db.Column(db.Integer, default=18)

    # 功能开关，存储为JSON
    features = db.Column(db.Text, default='{}')

    chain = db.Column(db.String(50), default='sepolia')
    chain_id = db.Column(db.Integer)
    contract_address = db.Column(db.String(42))
    tx_hash = db.Column(db.String(66))
    deployer_address = db.Column(db.String(42))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        """转换为字典"""
        return {
            'id': self.id,
            'wallet_address': self.wallet_address,
            'token_name': self.token_name,
            'token_symbol': self.token_symbol,
            'initial_supply': self.initial_supply,
            'decimals': self.decimals,
            'features': json.loads(self.features) if self.features else {},
            'chain': self.chain,
            'chain_id': self.chain_id,
            'contract_address': self.contract_address,
            'tx_hash': self.tx_hash,
            'deployer_address': self.deployer_address,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def save(self):
        """保存到数据库"""
        db.session.add(self)
        db.session.commit()
        return self