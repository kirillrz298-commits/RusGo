@echo off
echo ====================================================
echo  RusGo: Linking and Pushing to GitHub
echo ====================================================
echo.

echo [1/6] Initializing local Git repository...
git init

echo.
echo [2/6] Configuring remote repository link...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/kirillrz298-commits/RusGo.git

echo.
echo [3/6] Staging files for commit...
git add .

echo.
echo [4/6] Creating initial commit...
git commit -m "Initial commit: SQLite database API, dynamic landing page showcase, and premium SVG icons"

echo.
echo [5/6] Setting main branch name...
git branch -M main

echo.
echo [6/6] Pushing files to GitHub...
echo (If prompted, please log in or authorize GitHub in the browser window/terminal)
git push -u origin main

echo.
echo ====================================================
echo  GitHub upload task complete!
echo ====================================================
pause
