# AH Balancer - Interactive Battery Optimization Tool

Professional-grade application for optimizing battery pack configurations using Series × Parallel (SxP) matrix optimization.

## 🚀 Features

- **Interactive SxP Matrix Optimization** - Optimize 13×7 (or custom) battery configurations
- **Smart Swap Algorithm** - Intelligent cell swapping to minimize capacity spread
- **User Authentication** - Secure Supabase-based authentication
- **Database Storage** - Save and load optimization jobs in Supabase
- **Professional Reports** - Export to CSV, TSV, and Excel with job metadata
- **Real-time Optimization** - Instant suggestions and automated tolerance-based optimization

## 📋 Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier available)
- Modern web browser

## 🔧 Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd "Ah Calculation"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Supabase:**
   - Create `.env.local` file in project root
   - Add your Supabase credentials:
     ```env
     VITE_SUPABASE_URL=your_supabase_url
     VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

4. **Set up database:**
   - See `database/README.md` for detailed instructions
   - Run `database/01_battery_optimization_schema.sql` in Supabase SQL Editor

5. **Start development server:**
   ```bash
   npm run dev
   ```

## 📊 Database Schema

All database schema files are managed in the `database/` directory:

- **`database/01_battery_optimization_schema.sql`** - Complete database schema (run this in Supabase)
- **`database/README.md`** - Setup and usage instructions
- **`database/SCHEMA_REFERENCE.md`** - Detailed schema documentation
- **`database/migrations/`** - Future migration files

### Quick Schema Setup

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `database/01_battery_optimization_schema.sql`
3. Paste and run
4. Verify tables created in Table Editor

## 🏗️ Project Structure

```
Ah Calculation/
├── database/              # Database schema and migrations
│   ├── 01_battery_optimization_schema.sql  # Main schema file (numbered for ordering)
│   ├── README.md          # Setup instructions
│   ├── SCHEMA_REFERENCE.md # Schema documentation
│   └── migrations/        # Migration files
├── src/
│   ├── App.jsx            # Main AH Balancer component
│   ├── LoginGate.jsx      # Authentication component
│   ├── MainApp.jsx        # App router
│   ├── lib/
│   │   └── supabase.js    # Supabase client & helpers
│   └── ...
├── supabase-setup.sql     # Legacy schema (for reference)
└── ...
```

## 🔐 Authentication

The app uses Supabase Authentication:

- **Email/Password** registration and login
- **Secure sessions** with JWT tokens
- **User-specific data** isolation via Row Level Security

## 💾 Data Storage

All optimization jobs are stored in Supabase:

- **Job metadata** (customer, job card, date, battery spec)
- **Grid configuration** (S×P dimensions, tolerance)
- **Complete cell data** (all capacity values)
- **Automatic timestamps** (created/updated)

## 📤 Export Features

- **CSV Export** - Comma-separated values
- **TSV Export** - Tab-separated values
- **Excel Export** - Multi-sheet XLSX with summary
- **Copy to Clipboard** - CSV/TSV format

## 🛠️ Development

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 📝 License

[Add your license here]

## 🔗 Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Database Schema Documentation](./database/README.md)
- [Schema Reference](./database/SCHEMA_REFERENCE.md)
