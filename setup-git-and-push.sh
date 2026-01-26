#!/bin/bash
# Run this script from the video-script-generator folder to init git and push to GitHub.
# Usage: ./setup-git-and-push.sh [your-github-username]
# Or run the commands below manually.

set -e
cd "$(dirname "$0")"

echo "Initializing git repository..."
git init

echo "Staging all files..."
git add -A

echo "Creating initial commit..."
git commit -m "Initial commit: Video Script Generator app"

echo ""
echo "Next steps:"
echo "1. Create a NEW PRIVATE repository on GitHub: https://github.com/new"
echo "   - Name it 'video-script-generator' (or your choice)"
echo "   - Set visibility to Private"
echo "   - Do NOT initialize with README, .gitignore, or license"
echo ""
echo "2. Add the remote and push (replace YOUR_USERNAME with your GitHub username):"
echo "   git remote add origin https://github.com/YOUR_USERNAME/video-script-generator.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "Or, if you use SSH:"
echo "   git remote add origin git@github.com:YOUR_USERNAME/video-script-generator.git"
echo "   git branch -M main"
echo "   git push -u origin main"
