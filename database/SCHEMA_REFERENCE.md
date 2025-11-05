# Database Schema Reference

## 📋 Quick Reference

**Main Schema File:** `database/01_battery_optimization_schema.sql`  
**Setup Instructions:** See `database/README.md`

## 🗂️ Database Structure

### Tables Overview

```
battery_optimization_jobs (1) ──< (many) battery_cell_capacities
```

### Table Details

#### `battery_optimization_jobs`
Primary table for storing battery optimization project metadata.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `user_id` | UUID | Foreign key → auth.users |
| `serial_number` | TEXT | Unique tracking serial number (format: AH-YYYYMMDD-XXXX) |
| `customer_name` | TEXT | Customer/client name |
| `job_card` | TEXT | Job card/reference number |
| `job_date` | DATE | Date of optimization |
| `battery_spec` | TEXT | Battery specifications |
| `series_count` | INTEGER | Number of series (S), default: 13 |
| `parallel_count` | INTEGER | Number of parallel (P), default: 7 |
| `tolerance` | INTEGER | Tolerance in mAh, default: 20 |
| `created_at` | TIMESTAMP | Auto-generated timestamp |
| `updated_at` | TIMESTAMP | Auto-updated on changes |

#### `battery_cell_capacities`
Stores individual cell capacity measurements in milliampere-hours (mAh).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (auto-generated) |
| `optimization_job_id` | UUID | Foreign key → battery_optimization_jobs.id |
| `series_index` | INTEGER | Series position (0-based) |
| `parallel_index` | INTEGER | Parallel position (0-based) |
| `capacity_mah` | NUMERIC | Cell capacity in milliampere-hours (mAh) |
| `created_at` | TIMESTAMP | Auto-generated timestamp |

## 🔐 Security Policies

### Row Level Security (RLS)

**Enabled on:** `battery_optimization_jobs`, `battery_cell_capacities`

**Policy Pattern:**
- Users can only access their own data
- Based on `auth.uid() = user_id` matching
- Cascading policies for related tables

### Policy Names

**Battery Optimization Jobs:**
- `Users can view own optimization jobs` (SELECT)
- `Users can insert own optimization jobs` (INSERT)
- `Users can update own optimization jobs` (UPDATE)
- `Users can delete own optimization jobs` (DELETE)

**Battery Cell Capacities:**
- `Users can view own cell capacities` (SELECT)
- `Users can insert own cell capacities` (INSERT)
- `Users can update own cell capacities` (UPDATE)
- `Users can delete own cell capacities` (DELETE)

## 📊 Indexes

1. **`battery_optimization_jobs_user_id_idx`** - User job queries
2. **`battery_optimization_jobs_created_at_idx`** - Sorted listings (DESC)
3. **`battery_cell_capacities_job_id_idx`** - Cell data retrieval by job
4. **`battery_cell_capacities_position_idx`** - Grid position lookups (series_index, parallel_index)

## 🎯 Views

### `battery_optimization_summary`
Aggregated statistics view joining optimization jobs and cell capacities.

**Columns:**
- All job columns from `battery_optimization_jobs`
- `total_cells` - Number of cells in the optimization
- `avg_capacity_mah` - Average cell capacity in mAh
- `min_capacity_mah` - Minimum cell capacity in mAh
- `max_capacity_mah` - Maximum cell capacity in mAh

## ⚙️ Functions & Triggers

### Function: `update_updated_at_column()`
Automatically updates `updated_at` timestamp when a record is modified.

### Trigger: `update_battery_optimization_jobs_updated_at`
Fires before UPDATE on `battery_optimization_jobs` table to automatically update the `updated_at` timestamp.

## 🔄 Migration Guide

### Initial Setup
Run `database/01_battery_optimization_schema.sql` in Supabase SQL Editor.

### Future Changes
1. Create migration file in `database/migrations/`
2. Update `01_battery_optimization_schema.sql` with new structure (or create new numbered migration files like `02_`, `03_`, etc.)
3. Document changes in this file
4. Test in development before production

## 📝 Example Queries

### Get all optimization jobs for current user
```sql
SELECT * FROM battery_optimization_jobs 
WHERE user_id = auth.uid()
ORDER BY created_at DESC;
```

### Search job by serial number
```sql
SELECT * FROM battery_optimization_jobs 
WHERE user_id = auth.uid()
  AND serial_number = 'AH-20250126-0001';
```

### Get jobs by serial number pattern (partial match)
```sql
SELECT * FROM battery_optimization_jobs 
WHERE user_id = auth.uid()
  AND serial_number LIKE 'AH-20250126-%'
ORDER BY serial_number;
```

### Get job with cell capacity data
```sql
SELECT job.*, cell.* 
FROM battery_optimization_jobs job
LEFT JOIN battery_cell_capacities cell 
  ON job.id = cell.optimization_job_id
WHERE job.id = 'job-uuid-here'
ORDER BY cell.series_index, cell.parallel_index;
```

### Use optimization summary view
```sql
SELECT * FROM battery_optimization_summary 
WHERE user_id = auth.uid()
ORDER BY created_at DESC;
```

### Get job statistics
```sql
SELECT 
  customer_name,
  job_card,
  total_cells,
  avg_capacity_mah,
  min_capacity_mah,
  max_capacity_mah,
  (max_capacity_mah - min_capacity_mah) as capacity_spread
FROM battery_optimization_summary
WHERE user_id = auth.uid();
```

## 🔧 Maintenance

### Check RLS Status
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('battery_optimization_jobs', 'battery_cell_capacities');
```

### View All Policies
```sql
SELECT * FROM pg_policies 
WHERE tablename IN ('battery_optimization_jobs', 'battery_cell_capacities');
```

### Check Indexes
```sql
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('battery_optimization_jobs', 'battery_cell_capacities');
```

### Check Table Sizes
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('battery_optimization_jobs', 'battery_cell_capacities');
```

## 📚 Naming Convention

### Table Names
- **`battery_optimization_jobs`** - Descriptive name indicating it stores battery optimization project metadata
- **`battery_cell_capacities`** - Descriptive name indicating it stores individual cell capacity measurements

### Column Names
- **`optimization_job_id`** - Foreign key referencing the optimization job
- **`capacity_mah`** - Explicit unit (milliampere-hours) for clarity
- **`series_index`** / **`parallel_index`** - Clear position indicators

### Benefits of Meaningful Names
- ✅ Self-documenting code
- ✅ Easier for new developers to understand
- ✅ Better database query readability
- ✅ Clearer API documentation
- ✅ Reduced confusion in team collaboration