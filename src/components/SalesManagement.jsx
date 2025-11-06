import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { inventory, auth } from '../lib/supabase';
import { useRole } from '../hooks/useRole';

export default function SalesManagement() {
  const [salesTransactions, setSalesTransactions] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSalesForm, setShowSalesForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDate, setFilterDate] = useState({
    startDate: '',
    endDate: ''
  });

  const { canViewInventory, canManageInventory, loading: roleLoading } = useRole();

  const [salesForm, setSalesForm] = useState({
    item_id: '',
    transaction_date: new Date().toISOString().split('T')[0],
    quantity: '',
    unit_selling_price: '',
    customer_name: '',
    invoice_number: '',
    reference_number: '',
    notes: ''
  });

  useEffect(() => {
    if (canViewInventory) {
      loadData();
    }
  }, [canViewInventory]);

  async function loadData() {
    setLoading(true);
    try {
      const filters = {};
      if (filterDate.startDate) filters.startDate = filterDate.startDate;
      if (filterDate.endDate) filters.endDate = filterDate.endDate;

      const [salesData, itemsData] = await Promise.all([
        inventory.getAllSalesTransactions(filters),
        inventory.getAllItems()
      ]);
      setSalesTransactions(salesData || []);
      setItems(itemsData || []);
    } catch (error) {
      console.error('Error loading sales data:', error);
      alert('Failed to load sales data: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSalesFormChange(e) {
    const { name, value } = e.target;
    setSalesForm(prev => ({
      ...prev,
      [name]: value === '' ? '' : (name === 'quantity' || name === 'unit_selling_price' ? parseFloat(value) || '' : value)
    }));
  }

  async function handleSalesSubmit(e) {
    e.preventDefault();
    try {
      const salesData = {
        ...salesForm,
        item_id: salesForm.item_id,
        transaction_date: salesForm.transaction_date,
        quantity: parseInt(salesForm.quantity),
        unit_selling_price: parseFloat(salesForm.unit_selling_price),
        customer_name: salesForm.customer_name || null,
        invoice_number: salesForm.invoice_number || null,
        reference_number: salesForm.reference_number || null,
        notes: salesForm.notes || null
      };

      await inventory.createSalesTransaction(salesData);
      await loadData();
      setShowSalesForm(false);
      setSalesForm({
        item_id: '',
        transaction_date: new Date().toISOString().split('T')[0],
        quantity: '',
        unit_selling_price: '',
        customer_name: '',
        invoice_number: '',
        reference_number: '',
        notes: ''
      });
      alert('Sale recorded successfully! COGS and profit calculated automatically.');
    } catch (error) {
      console.error('Error creating sales transaction:', error);
      alert('Failed to create sales transaction: ' + error.message);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  }

  // Filter sales transactions
  const filteredSales = salesTransactions.filter(sale => {
    const matchesSearch = !searchQuery || 
      sale.inventory_items?.item_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.inventory_items?.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sale.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Calculate totals
  const totals = filteredSales.reduce((acc, sale) => ({
    revenue: acc.revenue + (sale.total_revenue || 0),
    cogs: acc.cogs + (sale.total_cogs || 0),
    profit: acc.profit + (sale.gross_profit || 0),
    count: acc.count + 1
  }), { revenue: 0, cogs: 0, profit: 0, count: 0 });

  if (loading || roleLoading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sales data...</p>
        </div>
      </div>
    );
  }

  if (!canViewInventory) {
    return (
      <div className="py-8 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center border border-red-200">
          <div className="text-red-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">You do not have permission to access the Sales Management module.</p>
          <p className="text-sm text-gray-500">Please contact an administrator to grant you access permissions.</p>
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
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Sales</h2>
              {canManageInventory && (
                <button
                  onClick={() => setShowSalesForm(true)}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium shadow-md"
                >
                  + Record New Sale
                </button>
              )}
            </div>

            {/* Search and Filters */}
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder="Search by item code, name, customer, or invoice..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  placeholder="Start Date"
                  value={filterDate.startDate}
                  onChange={(e) => setFilterDate({ ...filterDate, startDate: e.target.value })}
                  className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="date"
                  placeholder="End Date"
                  value={filterDate.endDate}
                  onChange={(e) => setFilterDate({ ...filterDate, endDate: e.target.value })}
                  className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={loadData}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Filter
                </button>
                {(filterDate.startDate || filterDate.endDate) && (
                  <button
                    onClick={() => {
                      setFilterDate({ startDate: '', endDate: '' });
                      loadData();
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500"
            >
              <h3 className="text-sm font-medium text-gray-600 mb-2">Total Revenue</h3>
              <p className="text-3xl font-bold text-blue-600">
                {formatCurrency(totals.revenue)}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {totals.count} transactions
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
                {formatCurrency(totals.cogs)}
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
                {formatCurrency(totals.profit)}
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
              <h3 className="text-sm font-medium text-gray-600 mb-2">Profit Margin</h3>
              <p className="text-3xl font-bold text-purple-600">
                {totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(2) : '0.00'}%
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Profitability ratio
              </p>
            </motion.div>
          </div>

          {/* Sales Transactions Table */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Sales Transactions</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
              <p className="text-sm text-blue-800">
                💡 <strong>Note:</strong> Sales transactions automatically calculate COGS based on the item's cost method (FIFO, LIFO, or Weighted Average).
                Revenue, COGS, and gross profit are calculated automatically.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Item Code
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Item Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice #
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
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Margin %
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="px-4 py-8 text-center text-gray-500">
                        No sales transactions found. {canManageInventory && 'Click "Record New Sale" to create one.'}
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {new Date(sale.transaction_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {sale.inventory_items?.item_code || 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {sale.inventory_items?.item_name || 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {sale.customer_name || 'N/A'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-mono">
                          {sale.invoice_number || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                          {sale.quantity}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-blue-600 font-medium">
                          {formatCurrency(sale.total_revenue)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600 font-medium">
                          {formatCurrency(sale.total_cogs)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                          {formatCurrency(sale.gross_profit)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                          <span className={`font-medium ${
                            sale.gross_profit_margin >= 30 ? 'text-green-600' :
                            sale.gross_profit_margin >= 20 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {sale.gross_profit_margin?.toFixed(2) || '0.00'}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredSales.length > 0 && (
                  <tfoot className="bg-gray-50 font-bold">
                    <tr>
                      <td colSpan="5" className="px-4 py-3 text-sm text-gray-900">
                        Total ({totals.count} transactions)
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">
                        {filteredSales.reduce((sum, sale) => sum + sale.quantity, 0)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-blue-600">
                        {formatCurrency(totals.revenue)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-red-600">
                        {formatCurrency(totals.cogs)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-green-600">
                        {formatCurrency(totals.profit)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <span className="text-purple-600">
                          {totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(2) : '0.00'}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Sales Form Modal */}
          {showSalesForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">Record New Sale</h2>
                  <button
                    onClick={() => setShowSalesForm(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={handleSalesSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
                      <select
                        name="item_id"
                        value={salesForm.item_id}
                        onChange={handleSalesFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Item</option>
                        {items.filter(item => item.status === 'active' && item.current_stock > 0).map(item => (
                          <option key={item.id} value={item.id}>
                            {item.item_code} - {item.item_name} (Stock: {item.current_stock})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Date *</label>
                      <input
                        type="date"
                        name="transaction_date"
                        value={salesForm.transaction_date}
                        onChange={handleSalesFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                      <input
                        type="number"
                        name="quantity"
                        value={salesForm.quantity}
                        onChange={handleSalesFormChange}
                        required
                        min="1"
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit Selling Price *</label>
                      <input
                        type="number"
                        step="0.01"
                        name="unit_selling_price"
                        value={salesForm.unit_selling_price}
                        onChange={handleSalesFormChange}
                        required
                        min="0"
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                      <input
                        type="text"
                        name="customer_name"
                        value={salesForm.customer_name}
                        onChange={handleSalesFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                      <input
                        type="text"
                        name="invoice_number"
                        value={salesForm.invoice_number}
                        onChange={handleSalesFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                    <input
                      type="text"
                      name="reference_number"
                      value={salesForm.reference_number}
                      onChange={handleSalesFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      placeholder="Job card, order number, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      name="notes"
                      value={salesForm.notes}
                      onChange={handleSalesFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      rows="3"
                    />
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                    <p className="text-sm text-blue-800">
                      💡 <strong>Note:</strong> COGS will be calculated automatically based on the item's cost method (FIFO, LIFO, or Weighted Average).
                      Revenue, COGS, and gross profit will be calculated and stored.
                    </p>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSalesForm(false);
                        setSalesForm({
                          item_id: '',
                          transaction_date: new Date().toISOString().split('T')[0],
                          quantity: '',
                          unit_selling_price: '',
                          customer_name: '',
                          invoice_number: '',
                          reference_number: '',
                          notes: ''
                        });
                      }}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                    >
                      Record Sale
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

