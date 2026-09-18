# ArchitectureNext Backend (Arcbackend)

Backend API service for ArchitectureNext e-learning platform built with Node.js, Express, PostgreSQL, and Prisma ORM.

## Features
- **Authentication**: JWT & OTP-based verification, password resets, role-based access control (Admin & Student).
- **Course & Module Management**: Courses, modules, lessons, video streaming & downloadable materials.
- **Payments**: Razorpay integration with payment verification and automatic course enrollment.
- **Media & Uploads**: Secure handling and streaming of educational videos and resources.
- **Database**: PostgreSQL with Prisma ORM.

## Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/architecturenextin-boop/Arcbackend.git
   cd Arcbackend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment variables:
   ```bash
   cp .env.example .env
   # Update DATABASE_URL, JWT_SECRET, RAZORPAY keys, and SMTP settings in .env
   ```

4. Generate Prisma Client & Run Migrations:
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```
