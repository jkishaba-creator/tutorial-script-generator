# Troubleshooting Guide

## Error -102: Connection Refused

This error means the Next.js development server isn't running or isn't accessible.

### Step 1: Check if Node.js is installed

Run this command in your terminal:
```bash
node --version
npm --version
```

If these commands don't work, you need to install Node.js:
- Visit https://nodejs.org/ and download the LTS version
- Or use Homebrew: `brew install node`

### Step 2: Install Dependencies

Navigate to the project directory and install dependencies:
```bash
cd /Users/joshuakishaba/video-script-generator
npm install
```

This will install all required packages including Next.js, React, and the API libraries.

### Step 3: Start the Development Server

After dependencies are installed, start the server:
```bash
npm run dev
```

You should see output like:
```
▲ Next.js 14.x.x
- Local:        http://localhost:3000
```

### Step 4: Access the Application

Once the server is running, open your browser and navigate to:
```
http://localhost:3000
```

### Common Issues

1. **Port 3000 already in use**: 
   - Kill the process using port 3000, or
   - Run `npm run dev -- -p 3001` to use a different port

2. **Missing API keys**:
   - Create `.env.local` file from `.env.local.example`
   - Add your `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`

3. **Module not found errors**:
   - Delete `node_modules` folder and `package-lock.json`
   - Run `npm install` again

4. **TypeScript errors**:
   - Make sure all dependencies are installed
   - Run `npm install` to ensure everything is up to date
