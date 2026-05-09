# Use Python 3.11 as the base image
FROM python:3.11-slim

# Install system dependencies for Playwright and Node.js
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    ffmpeg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy python requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers and their system dependencies
RUN playwright install --with-deps chromium

# Copy the rest of the application
COPY . .

# Build the Next.js frontend
WORKDIR /app/webapp
RUN npm install
RUN npm run build

# Go back to root
WORKDIR /app

# Expose port for Next.js (3000)
EXPOSE 3000

# Start script to run both backend and frontend
COPY start.sh .
RUN chmod +x start.sh

CMD ["./start.sh"]
