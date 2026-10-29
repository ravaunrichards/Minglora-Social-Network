# Seed data policy

Production seed data remains empty. Never seed fake users, posts, comments, messages, notifications, social counts or demo credentials. Tests must generate their own records in an isolated temporary database or data directory and clean up afterward. Local fixtures must never be loaded by production startup.