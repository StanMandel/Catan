@echo off
title Catan - serveur reseau local
cd /d "%~dp0"
node server.js %1
pause
