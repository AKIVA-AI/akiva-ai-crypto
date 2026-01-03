# enterprise crypto.

> **Institutional-grade cryptocurrency trading system** with advanced risk management, quantitative strategies, and enterprise security.

[![Production Ready](https://img.shields.io/badge/Production-Ready-green.svg)](https://github.com/enterprise-crypto)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](docker-compose.yml)
[![FreqTrade Enhanced](https://img.shields.io/badge/FreqTrade-Enhanced-blue.svg)](FREQTRADE_INTEGRATION_README.md)

## 🔥 FreqTrade Integration - Enterprise Enhancement

**🚀 QUANTUM LEAP IN CAPABILITIES** - Our platform now leverages FreqTrade's battle-tested infrastructure:

- **🤖 Advanced ML Models**: XGBoost, LightGBM, TensorFlow, PyTorch integration
- **📡 99.9% Uptime**: Multi-exchange WebSocket infrastructure with automatic failover
- **📈 10x Faster Backtesting**: Professional analytics with Sharpe/Sortino/Calmar ratios
- **⚙️ Enterprise Configuration**: JSON Schema validation and secure credential management
- **🔧 Production ML Ops**: Model versioning, continual learning, performance monitoring

**See [FreqTrade Integration Details](FREQTRADE_INTEGRATION_README.md) for complete technical documentation.**

## 📊 Overview

This is a **production-grade hedge fund trading platform** that transforms institutional-grade trading capabilities into a modern, scalable system. Built with enterprise security, advanced risk management, and AI-powered quantitative strategies.

### 🎯 Key Features

#### **Risk Management (Institutional Standard)**
- ✅ **Multi-Method VaR**: Historical, Parametric, Monte Carlo (99.9% confidence)
- ✅ **Portfolio Optimization**: Black-Litterman model with Modern Portfolio Theory
- ✅ **Stress Testing**: Historical crisis scenarios (2008, COVID, Crypto Winter)
- ✅ **Risk Attribution**: Factor-based risk decomposition
- ✅ **Liquidity-Adjusted VaR**: Market impact cost modeling

#### **Quantitative Strategies (AI-Powered)**
- 🤖 **Machine Learning Models**: LSTM, Gradient Boosting, Random Forest, ARIMA
- 📈 **Statistical Arbitrage**: Cointegration-based pairs trading
- 🎯 **Momentum Strategies**: Time-series, cross-sectional, absolute momentum
- 📊 **Performance Analytics**: Sharpe/Sortino/Calmar ratios, win rates

#### **Smart Execution (Ultra-Low Latency)**
- ⚡ **Intelligent Order Routing**: Multi-venue optimization (Binance, Coinbase, Kraken)
- 🎛️ **Algorithmic Execution**: TWAP/VWAP/POV/Iceberg/Adaptive algorithms
- 📈 **Market Impact Modeling**: Almgren-Chriss framework
- ⭐ **Execution Quality**: ISQ scoring, slippage analysis, timing risk

#### **Real-Time Intelligence**
- 🌐 **Multi-Source Data**: CoinGecko, CoinMarketCap, exchange APIs
- 📡 **WebSocket Streaming**: Real-time price/order book feeds with failover
- 🐋 **Whale Detection**: Large transaction monitoring and analysis
- 💬 **Sentiment Analysis**: Social media, news, and on-chain sentiment

#### **Enterprise Security & Compliance**
- 🔐 **Multi-Role Access**: Admin/CIO/Trader/Research/Ops/Auditor/Viewer
- 📋 **Audit Trails**: Immutable logging with user tracking
- 📑 **SEC Reporting**: Form PF, CPO-PQR automation frameworks
- 🚨 **Risk Monitoring**: Automated alerts and limit enforcement

## 🚀 Quick Start

### Prerequisites

- **Docker & Docker Compose** (latest versions)
- **Git** (for cloning)
- **4GB RAM** minimum (8GB recommended)
- **SSL Certificate** (for production)

### 1. Clone & Setup

```bash
# Clone the repository
git clone https://github.com/AKIVA-AI/akiva-ai-crypto.git
cd akiva-ai-crypto

# Copy environment configuration
cp .env.example .env

# Edit .env with your production values
nano .env  # Configure API keys, database credentials, etc.
```

### 2. Configure Environment

Edit `.env` with your production values:

```bash
# Required: Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Required: Market Data APIs
COINGECKO_API_KEY=your-coingecko-key
CMC_API_KEY=your-cmc-key
BINANCE_API_KEY=your-binance-key

# Optional: Trading APIs (use with extreme caution)
BINANCE_TRADING_KEY=your-trading-key
BINANCE_TRADING_SECRET=your-trading-secret
```

### 3. Deploy to Production

```bash
# Make deployment script executable
chmod +x deploy.sh

# Deploy to production (includes health checks and backups)
./deploy.sh production

# Or deploy to staging
./deploy.sh staging
```

### 4. Access Your Platform

After successful deployment:

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Monitoring**: http://localhost:9090 (Prometheus)
- **Dashboards**: http://localhost:3001 (Grafana)
- **Logs**: http://localhost:5601 (Kibana)

## 🏗️ Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      enterprise crypto.                      │
├─────────────────────────────────────────────────────────────┤
│  🌐 Frontend (React/TypeScript)    🔧 Backend (FastAPI)      │
│  🗄️ Database (Supabase/PostgreSQL)  ⚡ Cache (Redis)         │
│  📊 Monitoring (Prometheus/Grafana) 📝 Logging (ELK Stack) │
├─────────────────────────────────────────────────────────────┤
│  🏛️ Risk Engine        🤖 Quant Strategies    ⚡ Smart Router │
│  📈 Market Data       🔍 Analytics         🛡️ Security      │
└─────────────────────────────────────────────────────────────┘
```

### Services Architecture

- **API Backend**: FastAPI with async endpoints, WebSocket support
- **Frontend**: React/TypeScript with real-time dashboards
- **Database**: Supabase (primary) + PostgreSQL (local backup)
- **Cache**: Redis for high-performance data caching
- **Monitoring**: Prometheus metrics, Grafana dashboards
- **Logging**: ELK stack for centralized log management

## 🔧 Configuration

### Environment Variables

See `.env.example` for complete configuration options. Key settings:

#### Database & Cache
```bash
SUPABASE_URL=https://your-project.supabase.co
DATABASE_URL=postgresql://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379
```

#### Market Data APIs
```bash
COINGECKO_API_KEY=your-key
CMC_API_KEY=your-key
BINANCE_API_KEY=your-key
```

#### Security
```bash
JWT_SECRET_KEY=your-super-secure-key
ALLOWED_ORIGINS=["https://yourdomain.com"]
```

#### Risk Limits
```bash
MAX_PORTFOLIO_VAR=0.05
MAX_DAILY_LOSS=0.02
MAX_POSITION_SIZE=0.1
```

## 📊 API Documentation

### Core Endpoints

#### Risk Management
```bash
GET  /api/v1/risk/var/{book_id}           # Portfolio VaR calculation
POST /api/v1/risk/optimize/{book_id}      # Portfolio optimization
GET  /api/v1/risk/stress-test/{book_id}   # Stress testing
GET  /api/v1/risk/attribution/{book_id}   # Risk attribution
```

#### Trading Strategies
```bash
GET  /api/v1/strategies/ml-signals        # ML trading signals
GET  /api/v1/strategies/pairs             # Statistical arbitrage pairs
GET  /api/v1/strategies/momentum          # Momentum signals
POST /api/v1/strategies/backtest          # Strategy backtesting
```

#### Market Data
```bash
GET  /api/v1/market/prices/{instrument}   # Current prices
GET  /api/v1/market/orderbook/{instrument} # Order book data
GET  /api/v1/market/whales               # Whale transactions
GET  /api/v1/market/sentiment/{instrument} # Market sentiment
```

#### Execution
```bash
POST /api/v1/execution/route              # Smart order routing
POST /api/v1/execution/algorithmic        # Algorithmic execution
GET  /api/v1/execution/quality/{order_id} # Execution quality metrics
```

### Authentication

All API endpoints require JWT authentication:

```bash
# Login to get JWT token
POST /auth/login
{
  "email": "trader@hedgefund.com",
  "password": "secure-password"
}

# Use token in subsequent requests
Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
```

## 🛡️ Security Features

### Multi-Role Access Control
- **Admin**: Full system access, user management
- **CIO**: Strategy oversight, risk monitoring
- **Trader**: Order execution, position management
- **Research**: Strategy development, backtesting
- **Operations**: System monitoring, compliance
- **Auditor**: Read-only access, audit logs
- **Viewer**: Dashboard access only

### Enterprise Security
- JWT-based authentication with refresh tokens
- Row-level security (RLS) in database
- Encrypted data transmission (HTTPS/TLS)
- Audit logging with immutable trails
- Rate limiting and DDoS protection
- Multi-factor authentication support

## 📈 Monitoring & Analytics

### Real-Time Dashboards
- **Risk Dashboard**: VaR, stress tests, risk attribution
- **Performance Dashboard**: P&L, Sharpe ratios, drawdowns
- **Execution Dashboard**: Order routing, slippage analysis
- **Market Dashboard**: Real-time prices, sentiment, volume

### Alerting System
- Risk limit breaches
- Strategy performance deviations
- System health issues
- Market anomaly detection

### Reporting
- SEC Form PF compliance reports
- CPO-PQR regulatory filings
- Performance attribution reports
- Risk factor analysis

## 🚀 Deployment Options

### Docker Compose (Recommended)
```bash
# Single-command production deployment
./deploy.sh production

# Includes: API, Frontend, Database, Redis, Monitoring, Logging
```

### Cloud Deployment

#### AWS
```bash
# ECS Fargate deployment
aws ecs create-cluster --cluster-name hedge-fund-cluster
# ... (full AWS deployment configuration)
```

#### Kubernetes
```bash
# Deploy to Kubernetes cluster
kubectl apply -f k8s/
```

### Manual Deployment
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
npm install
npm run build
npm run preview
```

## 🔧 Development

### Local Development Setup
```bash
# Install dependencies
pip install -r backend/requirements.txt
npm install

# Start development servers
docker-compose -f docker-compose.dev.yml up -d

# Run backend
cd backend && uvicorn app.main:app --reload

# Run frontend (new terminal)
npm run dev
```

### Testing
```bash
# Backend tests
cd backend && pytest

# Frontend tests
npm test

# Integration tests
docker-compose -f docker-compose.test.yml up --abort-on-container-exit
```

### Code Quality
```bash
# Linting
black backend/  # Python formatting
eslint src/     # JavaScript/TypeScript linting

# Type checking
mypy backend/   # Python types
tsc --noEmit    # TypeScript types
```

## 📚 Documentation

### Architecture & Design
- **[Architecture Overview](docs/ARCHITECTURE.md)** - System design and component relationships
- **[Manifesto](docs/MANIFESTO.md)** - Our core values: safety, transparency, profitability
- **[Agent Responsibility Matrix](docs/AGENT_RESPONSIBILITY_MATRIX.md)** - Multi-agent system authority boundaries
- **[Why We Don't Always Trade](docs/WHY_WE_DONT_ALWAYS_TRADE.md)** - Philosophy of trade selectivity

### Production & Operations
- **[Production Checklist](docs/PRODUCTION_CHECKLIST.md)** - Go-live verification process
- **[Incident Response Runbook](docs/INCIDENT_RESPONSE_RUNBOOK.md)** - Emergency procedures
- **[Security Enforcement Proof](docs/SECURITY_ENFORCEMENT_PROOF.md)** - Server-side safety guarantees
- **[Audit Findings Report](docs/AUDIT_FINDINGS_REPORT.md)** - Full system audit results

### Development
- **[Contributing Guidelines](docs/CONTRIBUTING.md)** - How to contribute safely
- **[Code of Ethics](CODE_OF_ETHICS.md)** - Ethical commitments
- **API Docs**: http://localhost:8000/docs (Swagger UI)

### Strategy Development
- **[Signal Sources Architecture](docs/SIGNAL_SOURCES_ARCHITECTURE.md)** - How signals are generated
- **[Python Engine Architecture](docs/PYTHON_ENGINE_ARCHITECTURE.md)** - Backend strategy engine

### Deployment
- **[Northflank Deployment](docs/NORTHFLANK_DEPLOYMENT.md)** - Cloud deployment guide
- **[Python Agent Deployment](docs/PYTHON_AGENT_DEPLOYMENT.md)** - Agent deployment

## 🤝 Contributing

We welcome contributions that strengthen safety, improve transparency, and enhance reliability.

**Before contributing:**
1. Read the **[Manifesto](docs/MANIFESTO.md)** to understand our values
2. Review the **[Contributing Guidelines](docs/CONTRIBUTING.md)**
3. Check the **[Code of Ethics](CODE_OF_ETHICS.md)**

**What we accept:** Bug fixes, docs, tests, observability, UI improvements  
**What we reject:** Anything that weakens risk controls, bypasses safety gates, or adds hidden risks

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for full guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Important Disclaimer

**This software is for institutional use only. Cryptocurrency trading involves substantial risk of loss and is not suitable for every investor. Past performance does not guarantee future results.**

### Regulatory Compliance
- SEC-registered investment advisers only
- Form PF and CPO-PQR reporting required
- KYC/AML compliance mandatory
- Risk management systems must be certified

### Production Requirements
- Minimum $20M AUM for hedge fund compliance
- Independent risk management oversight
- Third-party audit requirements
- Regulatory filing obligations

## 🆘 Support

### Documentation
- 📖 [API Documentation](http://localhost:8000/docs)
- 📚 [Architecture Guide](docs/architecture.md)
- 🛡️ [Security Handbook](docs/security.md)

### Community
- 💬 [Discord Community](https://discord.gg/hedge-fund-platform)
- 📧 [Email Support](support@hedgefundplatform.com)
- 🐛 [Issue Tracker](https://github.com/AKIVA-AI/akiva-ai-crypto/issues)

### Enterprise Support
- 📞 24/7 Technical Support
- 🎯 Dedicated Account Manager
- 🚀 Custom Development Services
- 📊 Advanced Training Programs

---

**Built for institutional excellence. Powered by advanced quantitative methods.**

*enterprise crypto. — Next generation cryptocurrency trading technology.*
