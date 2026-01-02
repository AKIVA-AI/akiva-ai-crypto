# 🚀 Aggressive 2-3 Week Production Plan

**Target:** Production-ready deployment on Northflank  
**Timeline:** 2-3 weeks  
**Status:** In Progress  
**Last Updated:** January 2, 2026

---

## ✅ What Northflank Already Handles

- ✅ Docker orchestration
- ✅ Redis addon (managed, TLS-enabled)
- ✅ Health checks (HTTP endpoints)
- ✅ Deployment automation
- ✅ Environment management (staging/production)
- ✅ TLS/SSL certificates
- ✅ Load balancing
- ✅ Auto-scaling capabilities

**Result:** We can focus on code quality, testing, and safety mechanisms.

---

## 📅 WEEK 1: Critical Foundation (Days 1-7)

### **Day 1-2: CI/CD Pipeline** ✅ COMPLETED
**Status:** ✅ Done  
**Files Created:**
- `.github/workflows/ci.yml` - Automated testing pipeline

**What it does:**
- Runs frontend lint, type check, and build on every push/PR
- Runs backend tests with coverage reporting
- Security scanning with Trivy
- Uploads results to GitHub Security tab

**Next Steps:**
1. Add GitHub secrets for Supabase credentials
2. Test the pipeline with a dummy commit
3. Fix any failing tests

---

### **Day 3-4: Environment Configuration** ✅ COMPLETED
**Status:** ✅ Done  
**Files Updated:**
- `.env.example` - Added missing critical variables

**Added Variables:**
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (for alerts)
- `KRAKEN_API_KEY` / `KRAKEN_API_SECRET`
- `TOTAL_CAPITAL` (for capital allocation)
- `PAPER_TRADING` flag (safety first)

**Next Steps:**
1. Copy `.env.example` to `.env` and fill in real values
2. Add `.env` to `.gitignore` (if not already)
3. Rotate any exposed keys from git history

---

### **Day 5-7: Critical Path Testing** 🔄 IN PROGRESS
**Priority:** 🔴 CRITICAL  
**Target:** Test the 3 most important flows

**Tests to Add:**

1. **Trading Gate Tests** (`src/lib/tradingGate.test.ts`)
   - Kill switch blocks all trades
   - Reduce-only mode allows only closing trades
   - Data quality gates work correctly
   - Exposure limits enforced

2. **Risk Engine Tests** (`backend/tests/test_risk_engine_critical.py`)
   - Risk agent can veto trades
   - Position limits enforced
   - Daily loss limits work
   - Concentration limits work

3. **Order Gateway Tests** (`backend/tests/test_order_gateway.py`)
   - Orders go through single gateway
   - Kill switch checked before execution
   - Audit trail created for all orders
   - Transaction integrity maintained

**Deliverable:** 3 test files with >80% coverage of critical paths

---

## 📅 WEEK 2: Testing & TypeScript (Days 8-14)

### **Day 8-10: Frontend Test Infrastructure**
**Priority:** 🔴 CRITICAL

**Setup:**
```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

**Add to package.json:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

**Tests to Add:**
- Trading gate component tests
- Risk dashboard tests
- Order ticket tests
- Kill switch toggle tests

**Target:** 40-50% frontend coverage

---

### **Day 11-12: TypeScript Strict Mode (Incremental)**
**Priority:** 🟡 HIGH

**Strategy:** Enable strict mode incrementally by directory

**Phase 1: Enable for new code**
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  },
  "exclude": [
    "src/components/**/*",  // Fix these later
    "src/pages/**/*"        // Fix these later
  ]
}
```

**Phase 2: Fix critical files**
- `src/lib/tradingGate.ts`
- `src/lib/schemas.ts`
- `src/hooks/useTradingGate.ts`
- `src/hooks/useOrders.ts`

**Target:** Critical paths fully typed

---

### **Day 13-14: Backend Test Expansion**
**Priority:** 🟡 HIGH

**Tests to Add:**
- Agent orchestrator tests
- Database transaction tests
- Supabase function integration tests (top 5 functions)
- WebSocket connection tests

**Target:** 60-70% backend coverage

---

## 📅 WEEK 3: Integration & Deployment (Days 15-21)

### **Day 15-16: Integration Testing**
**Priority:** 🟡 HIGH

**End-to-End Scenarios:**
1. User logs in → Views dashboard → Places paper trade → Trade blocked by risk
2. Admin enables kill switch → All trading blocked → Verify audit log
3. Strategy generates signal → Meta-decision approves → Risk approves → Order executed
4. Daily loss limit hit → All new trades blocked → Only reduce-only allowed

**Tools:** Playwright or Cypress

---

### **Day 17-18: Staging Deployment on Northflank**
**Priority:** 🟡 HIGH

**Steps:**
1. Push code to `develop` branch
2. Deploy to Northflank staging environment
3. Run smoke tests
4. Verify all services healthy
5. Test with paper trading mode

**Checklist:**
- [ ] Frontend loads and renders
- [ ] API health check passes
- [ ] Redis connection works
- [ ] Supabase connection works
- [ ] Kill switch toggles correctly
- [ ] Paper trades execute successfully

---

### **Day 19-20: Production Prep**
**Priority:** 🟡 HIGH

**Tasks:**
1. Review all environment variables in Northflank
2. Set `PAPER_TRADING=true` in production (initially)
3. Configure monitoring alerts
4. Set up Telegram alerts
5. Document rollback procedure
6. Create incident response runbook

---

### **Day 21: Limited Production Rollout**
**Priority:** 🟢 MEDIUM

**Strategy:** Observer Mode Only
- Deploy to production
- Enable only Observer mode for users
- Monitor for 48 hours
- No live trading enabled

**Success Criteria:**
- Zero errors in logs
- All health checks green
- Dashboard loads <2 seconds
- WebSocket connections stable

---

## 🎯 Success Metrics

### **Week 1 Goals:**
- [x] CI/CD pipeline running
- [x] Environment config complete
- [ ] Critical path tests added (3 files)

### **Week 2 Goals:**
- [ ] Frontend test infrastructure setup
- [ ] TypeScript strict mode for critical files
- [ ] Backend coverage >60%

### **Week 3 Goals:**
- [ ] Staging deployment successful
- [ ] Integration tests passing
- [ ] Production deployed (Observer mode)

---

## 🚨 Blockers & Risks

### **Known Risks:**
1. **Test writing takes longer than expected**
   - Mitigation: Focus on critical paths only
   - Fallback: Deploy with manual testing

2. **TypeScript strict mode reveals many errors**
   - Mitigation: Fix incrementally, critical files first
   - Fallback: Keep strict mode off for non-critical code

3. **Northflank deployment issues**
   - Mitigation: Test in staging first
   - Fallback: Use docker-compose locally

---

## 📞 Support & Resources

**Documentation:**
- [Northflank Deployment Guide](./NORTHFLANK_DEPLOYMENT.md)
- [Production Checklist](./PRODUCTION_CHECKLIST.md)
- [Incident Response Runbook](./INCIDENT_RESPONSE_RUNBOOK.md)

**Next Review:** End of Week 1 (Day 7)

---

**Last Updated:** January 2, 2026  
**Plan Owner:** Development Team  
**Approved By:** CTO

