import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { inventory } from '../lib/supabase';

export default function PLDashboard() {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [itemBreakdown, setItemBreakdown] = useState([]);
  const [salesTransactions, setSalesTransactions] = useState([]);
  
  // Date range filters
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // First day of current month
    endDate: new Date().toISOString().split('T')[0] // Today
  });

  // Period presets
  const [selectedPeriod, setSelectedPeriod] = useState('this_month');

  useEffect(() => {
    loadPLData();
  }, [dateRange]);

  async function loadPLData() {
    setLoading(true);
    try {
      const [plReport, plByItem, sales] = await Promise.all([
        inventory.getPeriodicPLReport(dateRange.startDate, dateRange.endDate),
        inventory.getPLByItem(dateRange.startDate, dateRange.endDate),
        inventory.getAllSalesTransactions({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        })
      ]);

      setReportData(plReport);
      setItemBreakdown(plByItem);
      setSalesTransactions(sales);
    } catch (error) {
      console.error('Error loading P&L data:', error);
      alert('Failed to load P&L data: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  function handlePeriodChange(period) {
    setSelectedPeriod(period);
    const today = new Date();
    let start, end;

    switch (period) {
      case 'today':
        start = end = today.toISOString().split('T')[0];
        break;
      case 'this_week':
        const dayOfWeek = today.getDay();
        start = new Date(today.setDate(today.getDate() - dayOfWeek));
        end = new Date();
        start = start.toISOString().split('T')[0];
        end = end.toISOString().split('T')[0];
        break;
      case 'this_month':
        start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        end = new Date().toISOString().split('T')[0];
        break;
      case 'last_month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().split('T')[0];
        end = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().split('T')[0];
        break;
      case 'this_year':
        start = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
        end = new Date().toISOString().split('T')[0];
        break;
      case 'last_year':
        start = new Date(today.getFullYear() - 1, 0, 1).toISOString().split('T')[0];
        end = new Date(today.getFullYear() - 1, 11, 31).toISOString().split('T')[0];
        break;
      default:
        return;
    }

    setDateRange({ startDate: start, endDate: end });
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  }

  function formatPercent(value) {
    return `${(value || 0).toFixed(2)}%`;
  }

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading P&L Report...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <div className="max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Profit & Loss Reports</h2>
            
            {/* Date Range Selector */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex gap-2">
                {['today', 'this_week', 'this_month', 'last_month', 'this_year', 'last_year'].map((period) => (
                  <button
                    key={period}
                    onClick={() => handlePeriodChange(period)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      selectedPeriod === period
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {period.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </button>
                ))}
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-600">to</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={loadPLData}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          {reportData && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500"
              >
                <h3 className="text-sm font-medium text-gray-600 mb-2">Total Revenue</h3>
                <p className="text-3xl font-bold text-blue-600">
                  {formatCurrency(reportData.total_revenue)}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  {reportData.transaction_count} transactions
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500"
              >
                <h3 className="text-sm font-medium text-gray-600 mb-2">Total COGS</h3>
                <p className="text-3xl font-bold text-red-600">
                  {formatCurrency(reportData.total_cogs)}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Cost of Goods Sold
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500"
              >
                <h3 className="text-sm font-medium text-gray-600 mb-2">Gross Profit</h3>
                <p className="text-3xl font-bold text-green-600">
                  {formatCurrency(reportData.total_gross_profit)}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Revenue - COGS
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500"
              >
                <h3 className="text-sm font-medium text-gray-600 mb-2">Gross Profit Margin</h3>
                <p className="text-3xl font-bold text-purple-600">
                  {formatPercent(reportData.gross_profit_margin)}
                </p>
                <p className="text-xs text-gray-500 mt-2">
                  Profitability ratio
                </p>
              </motion.div>
            </div>
          )}

          {/* P&L Breakdown by Item */}
          {itemBreakdown.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">P&L Breakdown by Item</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Item Code
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Item Name
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qty Sold
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        COGS
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gross Profit
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Margin %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {itemBreakdown.map((item) => (
                      <tr key={item.item_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.item_code}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {item.item_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {item.quantity_sold}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-blue-600 font-medium">
                          {formatCurrency(item.total_revenue)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600 font-medium">
                          {formatCurrency(item.total_cogs)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                          {formatCurrency(item.total_gross_profit)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                          <span className={`font-medium ${
                            item.gross_profit_margin >= 30 ? 'text-green-600' :
                            item.gross_profit_margin >= 20 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {formatPercent(item.gross_profit_margin)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {itemBreakdown.length > 0 && (
                    <tfoot className="bg-gray-50 font-bold">
                      <tr>
                        <td colSpan="2" className="px-4 py-3 text-sm text-gray-900">
                          Total
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {itemBreakdown.reduce((sum, item) => sum + item.quantity_sold, 0)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-blue-600">
                          {formatCurrency(itemBreakdown.reduce((sum, item) => sum + item.total_revenue, 0))}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-red-600">
                          {formatCurrency(itemBreakdown.reduce((sum, item) => sum + item.total_cogs, 0))}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-green-600">
                          {formatCurrency(itemBreakdown.reduce((sum, item) => sum + item.total_gross_profit, 0))}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          {formatPercent(
                            itemBreakdown.reduce((sum, item) => sum + item.total_revenue, 0) > 0
                              ? (itemBreakdown.reduce((sum, item) => sum + item.total_gross_profit, 0) /
                                 itemBreakdown.reduce((sum, item) => sum + item.total_revenue, 0)) * 100
                              : 0
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          {/* Recent Sales Transactions */}
          {salesTransactions.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Sales Transactions</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Revenue
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        COGS
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Profit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {salesTransactions.slice(0, 20).map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {new Date(transaction.transaction_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {transaction.inventory_items?.item_code || 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {transaction.customer_name || 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {transaction.quantity}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-blue-600 font-medium">
                          {formatCurrency(transaction.total_revenue)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600 font-medium">
                          {formatCurrency(transaction.total_cogs)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                          {formatCurrency(transaction.gross_profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!reportData && !loading && (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <p className="text-gray-600">No sales data available for the selected period.</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

