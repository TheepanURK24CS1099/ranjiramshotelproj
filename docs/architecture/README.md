# Architecture Documentation

## Purpose

This folder contains the planned architecture notes for the Ranjirams Hotel Management System.

## Planned Frontend and Backend Separation

- hotel-web will host the Next.js frontend
- hotel-api will host the Express backend
- The frontend and backend will remain separate services

## Attendance Flow Summary

eSSL MB160 → ADMS push → dedicated external hotel ADMS port → Nginx → hotel-api → Express attendance engine → PostgreSQL

## Production Isolation Rule

This architecture must remain isolated from the Hostel and Mansion production systems.

Never share production databases, routes, ports, logs, backups, or environment files across projects.