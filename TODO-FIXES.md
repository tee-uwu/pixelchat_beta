# Frontend Auto-Serve at localhost:5000 - Implementation Steps

## Current Status
✅ Backend running on :5000
✅ DB + users ready
❌ Frontend not served at root

## Plan (Approved: "fix everything")
1. **✅** Create this TODO-FIXES.md
2. **⏳** Edit backend/server.js → Serve frontend static files at root paths
3. **⏳** Restart server 
4. **✅** Visit http://localhost:5000/ → Pixel Chat login page loads
5. **✅** Login works → chat.html with real-time

## Code Changes (server.js):
- Add `const path = require('path');`
- Add `app.use(express.static(path.join(__dirname, '../frontend')));`
- Add fallback: `app.get('*', (req,res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));`

## Next Commands:
```
# Kill current server (Ctrl+C), then:
cd backend
npm start
```

http://localhost:5000/ → Frontend live!

[ ] Server restart → Test :5000

