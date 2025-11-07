import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { inventory, accounting } from '../lib/supabase';
import { useRole } from '../hooks/useRole';

export default function SalesManagement() {
  const [activeTab, setActiveTab] = useState('estimates'); // 'estimates', 'invoices', 'sales'
  const [salesTransactions, setSalesTransactions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [items, setItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSalesForm, setShowSalesForm] = useState(false);
  const [showEstimateForm, setShowEstimateForm] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { canViewInventory, canManageInventory, loading: roleLoading } = useRole();

  const [salesForm, setSalesForm] = useState({
    item_id: '',
    transaction_date: new Date().toISOString().split('T')[0],
    quantity: '',
    unit_selling_price: '',
    customer_id: '',
    invoice_number: '',
    reference_number: '',
    notes: ''
  });

  const [estimateForm, setEstimateForm] = useState({
    customer_id: '',
    estimate_date: new Date().toISOString().split('T')[0],
    valid_until: '',
    notes: '',
    items: []
  });

  const [invoiceForm, setInvoiceForm] = useState({
    customer_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
    items: []
  });

  useEffect(() => {
    if (canViewInventory) {
      loadData();
    }
  }, [canViewInventory, activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      const [salesData, itemsData, customersData, invoicesData, estimatesData, taxRatesData] = await Promise.all([
        inventory.getAllSalesTransactions(),
        inventory.getAllItems(),
        accounting.getAllContacts({ contact_type: 'customer', status: 'active' }),
        accounting.getAllInvoices(),
        accounting.getAllEstimates(),
        accounting.getAllTaxRates()
      ]);
      setSalesTransactions(salesData || []);
      setItems(itemsData || []);
      setCustomers(customersData || []);
      setInvoices(invoicesData || []);
      setEstimates(estimatesData || []);
      setTaxRates(taxRatesData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data: ' + error.message);
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
        customer_name: customers.find(c => c.id === salesForm.customer_id)?.contact_name || salesForm.customer_name || null,
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
        customer_id: '',
        invoice_number: '',
        reference_number: '',
        notes: ''
      });
      alert('Sale recorded successfully!');
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

  // Calculate totals (with COGS)
  const totals = filteredSales.reduce((acc, sale) => ({
    revenue: acc.revenue + (sale.total_revenue || 0),
    cogs: acc.cogs + (sale.total_cogs || 0),
    profit: acc.profit + (sale.gross_profit || 0),
    count: acc.count + 1
  }), { revenue: 0, cogs: 0, profit: 0, count: 0 });

  // Estimate form handlers
  function addEstimateItem() {
    setEstimateForm(prev => ({
      ...prev,
      items: [...prev.items, {
        item_id: '',
        description: '',
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        tax_rate: 0
      }]
    }));
  }

  function updateEstimateItem(index, field, value) {
    setEstimateForm(prev => {
      const updated = [...prev.items];
      updated[index] = {
        ...updated[index],
        [field]: field === 'quantity' || field === 'unit_price' || field === 'discount_percent' || field === 'tax_rate' 
          ? parseFloat(value) || 0 
          : value
      };
      
      // Calculate tax amount
      const item = updated[index];
      const subtotal = item.quantity * item.unit_price * (1 - item.discount_percent / 100);
      item.tax_amount = subtotal * (item.tax_rate / 100);
      
      return { ...prev, items: updated };
    });
  }

  function removeEstimateItem(index) {
    setEstimateForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  }

  async function handleEstimateSubmit(e) {
    e.preventDefault();
    try {
      if (estimateForm.items.length === 0) {
        alert('Please add at least one item to the estimate.');
        return;
      }

      // Create estimate
      const estimate = await accounting.createEstimate({
        customer_id: estimateForm.customer_id,
        estimate_date: estimateForm.estimate_date,
        valid_until: estimateForm.valid_until || null,
        notes: estimateForm.notes || null
      });

      // Add estimate items
      for (const item of estimateForm.items) {
        await accounting.addEstimateItem(estimate.id, item);
      }

      await loadData();
      setShowEstimateForm(false);
      setEstimateForm({
        customer_id: '',
        estimate_date: new Date().toISOString().split('T')[0],
        valid_until: '',
        notes: '',
        items: []
      });
      alert('Estimate created successfully!');
    } catch (error) {
      console.error('Error creating estimate:', error);
      alert('Failed to create estimate: ' + error.message);
    }
  }

  // Invoice form handlers
  function addInvoiceItem() {
    setInvoiceForm(prev => ({
      ...prev,
      items: [...prev.items, {
        item_id: '',
        description: '',
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        tax_rate: 0
      }]
    }));
  }

  function updateInvoiceItem(index, field, value) {
    setInvoiceForm(prev => {
      const updated = [...prev.items];
      updated[index] = {
        ...updated[index],
        [field]: field === 'quantity' || field === 'unit_price' || field === 'discount_percent' || field === 'tax_rate' 
          ? parseFloat(value) || 0 
          : value
      };
      
      // Calculate tax amount
      const item = updated[index];
      const subtotal = item.quantity * item.unit_price * (1 - item.discount_percent / 100);
      item.tax_amount = subtotal * (item.tax_rate / 100);
      
      return { ...prev, items: updated };
    });
  }

  function removeInvoiceItem(index) {
    setInvoiceForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  }

  async function handleInvoiceSubmit(e) {
    e.preventDefault();
    try {
      if (invoiceForm.items.length === 0) {
        alert('Please add at least one item to the invoice.');
        return;
      }

      // Create invoice
      const invoice = await accounting.createInvoice({
        customer_id: invoiceForm.customer_id,
        invoice_date: invoiceForm.invoice_date,
        due_date: invoiceForm.due_date || null,
        notes: invoiceForm.notes || null
      });

      // Add invoice items
      for (const item of invoiceForm.items) {
        await accounting.addInvoiceItem(invoice.id, item);
      }

      await loadData();
      setShowInvoiceForm(false);
      setInvoiceForm({
        customer_id: '',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: '',
        notes: '',
        items: []
      });
      alert('Invoice created successfully!');
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice: ' + error.message);
    }
  }

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
                <div className="flex gap-2">
                  {activeTab === 'estimates' && (
                    <button
                      onClick={() => setShowEstimateForm(true)}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium shadow-md"
                    >
                      + Create Estimate
                    </button>
                  )}
                  {activeTab === 'invoices' && (
                    <button
                      onClick={() => setShowInvoiceForm(true)}
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium shadow-md"
                    >
                      + Create Invoice
                    </button>
                  )}
                  {activeTab === 'sales' && (
                    <button
                      onClick={() => setShowSalesForm(true)}
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium shadow-md"
                    >
                      + Record New Sale
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b">
              <button
                onClick={() => setActiveTab('estimates')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'estimates'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Estimates ({estimates.length})
              </button>
              <button
                onClick={() => setActiveTab('invoices')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'invoices'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Invoices ({invoices.length})
              </button>
              <button
                onClick={() => setActiveTab('sales')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'sales'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Sales Transactions ({salesTransactions.length})
              </button>
            </div>

            {/* Search */}
            {activeTab === 'sales' && (
              <div className="mt-4">
                <input
                  type="text"
                  placeholder="Search by item code, name, customer, or invoice..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </div>

          {/* Estimates Tab */}
          {activeTab === 'estimates' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Estimates</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estimate #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Valid Until</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {estimates.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                          No estimates found. Click "Create Estimate" to get started.
                        </td>
                      </tr>
                    ) : (
                      estimates.map((estimate) => (
                        <tr key={estimate.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {estimate.estimate_number}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {new Date(estimate.estimate_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {estimate.contacts?.company_name || estimate.contacts?.contact_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                            {formatCurrency(estimate.total_amount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {estimate.valid_until ? new Date(estimate.valid_until).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              estimate.status === 'accepted' ? 'bg-green-100 text-green-800' :
                              estimate.status === 'rejected' ? 'bg-red-100 text-red-800' :
                              estimate.status === 'converted' ? 'bg-blue-100 text-blue-800' :
                              estimate.status === 'expired' ? 'bg-gray-100 text-gray-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {estimate.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Invoices Tab */}
          {activeTab === 'invoices' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Invoices</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoices.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                          No invoices found. Click "Create Invoice" to get started.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((invoice) => (
                        <tr key={invoice.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {invoice.invoice_number}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {new Date(invoice.invoice_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {invoice.contacts?.company_name || invoice.contacts?.contact_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                            {formatCurrency(invoice.total_amount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600">
                            {formatCurrency(invoice.paid_amount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600 font-medium">
                            {formatCurrency(invoice.balance_amount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                              invoice.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                              invoice.status === 'overdue' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {invoice.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sales Transactions Tab */}
          {activeTab === 'sales' && (
            <>
              {/* Summary Cards (with COGS) */}
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

              {/* Sales Transactions Table (with COGS) */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Sales Transactions</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Code</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">COGS</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin %</th>
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
            </>
          )}

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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                      <select
                        name="customer_id"
                        value={salesForm.customer_id}
                        onChange={handleSalesFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Customer</option>
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.id}>
                            {customer.company_name || customer.contact_name}
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
                      <select
                        name="item_id"
                        value={salesForm.item_id}
                        onChange={handleSalesFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Item</option>
                        {items.filter(item => item.status === 'active').map(item => (
                          <option key={item.id} value={item.id}>
                            {item.item_code} - {item.item_name} {item.current_stock > 0 ? `(Stock: ${item.current_stock})` : '(Out of Stock)'}
                          </option>
                        ))}
                      </select>
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
                          customer_id: '',
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

          {/* Estimate Form Modal */}
          {showEstimateForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">Create Estimate</h2>
                  <button
                    onClick={() => setShowEstimateForm(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={handleEstimateSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                      <select
                        value={estimateForm.customer_id}
                        onChange={(e) => setEstimateForm(prev => ({ ...prev, customer_id: e.target.value }))}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Customer</option>
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.id}>
                            {customer.company_name || customer.contact_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Estimate Date *</label>
                      <input
                        type="date"
                        value={estimateForm.estimate_date}
                        onChange={(e) => setEstimateForm(prev => ({ ...prev, estimate_date: e.target.value }))}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
                    <input
                      type="date"
                      value={estimateForm.valid_until}
                      onChange={(e) => setEstimateForm(prev => ({ ...prev, valid_until: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Estimate Items */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">Items *</label>
                      <button
                        type="button"
                        onClick={addEstimateItem}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className="space-y-2">
                      {estimateForm.items.length > 0 && (
                        <div className="hidden md:grid grid-cols-12 gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <span className="col-span-4">Item</span>
                          <span className="col-span-2">Qty</span>
                          <span className="col-span-2">Unit Price</span>
                          <span className="col-span-2">Tax %</span>
                          <span className="col-span-2 text-right">Line Total</span>
                        </div>
                      )}
                      {estimateForm.items.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-md">
                          <div className="col-span-4">
                            <select
                              value={item.item_id}
                              onChange={(e) => {
                                const selectedItem = items.find(i => i.id === e.target.value);
                                updateEstimateItem(index, 'item_id', e.target.value);
                                if (selectedItem) {
                                  updateEstimateItem(index, 'unit_price', selectedItem.selling_price || 0);
                                  updateEstimateItem(index, 'description', selectedItem.item_name);
                                }
                              }}
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              required
                            >
                              <option value="">Select Item</option>
                              {items.filter(i => i.status === 'active').map(itemOption => (
                                <option key={itemOption.id} value={itemOption.id}>
                                  {itemOption.item_code} - {itemOption.item_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              placeholder="Qty"
                              value={item.quantity}
                              onChange={(e) => updateEstimateItem(index, 'quantity', e.target.value)}
                              min="0.01"
                              step="0.01"
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              required
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              placeholder="Price"
                              value={item.unit_price}
                              onChange={(e) => updateEstimateItem(index, 'unit_price', e.target.value)}
                              min="0"
                              step="0.01"
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              required
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              placeholder="Tax %"
                              value={item.tax_rate}
                              onChange={(e) => updateEstimateItem(index, 'tax_rate', e.target.value)}
                              min="0"
                              max="100"
                              step="0.01"
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                            />
                          </div>
                          <div className="col-span-2 flex gap-1">
                            <span className="flex-1 p-2 text-sm text-gray-700 bg-white rounded-md border">
                              {formatCurrency((item.quantity * item.unit_price * (1 - item.discount_percent / 100)) + (item.tax_amount || 0))}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeEstimateItem(index)}
                              className="px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {estimateForm.items.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No items added. Click "Add Item" to start.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={estimateForm.notes}
                      onChange={(e) => setEstimateForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      rows="3"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEstimateForm(false);
                        setEstimateForm({
                          customer_id: '',
                          estimate_date: new Date().toISOString().split('T')[0],
                          valid_until: '',
                          notes: '',
                          items: []
                        });
                      }}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={estimateForm.items.length === 0}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:bg-gray-400"
                    >
                      Create Estimate
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Invoice Form Modal */}
          {showInvoiceForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">Create Invoice</h2>
                  <button
                    onClick={() => setShowInvoiceForm(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={handleInvoiceSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                      <select
                        value={invoiceForm.customer_id}
                        onChange={(e) => setInvoiceForm(prev => ({ ...prev, customer_id: e.target.value }))}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Customer</option>
                        {customers.map(customer => (
                          <option key={customer.id} value={customer.id}>
                            {customer.company_name || customer.contact_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date *</label>
                      <input
                        type="date"
                        value={invoiceForm.invoice_date}
                        onChange={(e) => setInvoiceForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={invoiceForm.due_date}
                      onChange={(e) => setInvoiceForm(prev => ({ ...prev, due_date: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Invoice Items */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">Items *</label>
                      <button
                        type="button"
                        onClick={addInvoiceItem}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className="space-y-2">
                      {invoiceForm.items.length > 0 && (
                        <div className="hidden md:grid grid-cols-12 gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <span className="col-span-4">Item</span>
                          <span className="col-span-2">Qty</span>
                          <span className="col-span-2">Unit Price</span>
                          <span className="col-span-2">Tax %</span>
                          <span className="col-span-2 text-right">Line Total</span>
                        </div>
                      )}
                      {invoiceForm.items.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-md">
                          <div className="col-span-4">
                            <select
                              value={item.item_id}
                              onChange={(e) => {
                                const selectedItem = items.find(i => i.id === e.target.value);
                                updateInvoiceItem(index, 'item_id', e.target.value);
                                if (selectedItem) {
                                  updateInvoiceItem(index, 'unit_price', selectedItem.selling_price || 0);
                                  updateInvoiceItem(index, 'description', selectedItem.item_name);
                                }
                              }}
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              required
                            >
                              <option value="">Select Item</option>
                              {items.filter(i => i.status === 'active').map(itemOption => (
                                <option key={itemOption.id} value={itemOption.id}>
                                  {itemOption.item_code} - {itemOption.item_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              placeholder="Qty"
                              value={item.quantity}
                              onChange={(e) => updateInvoiceItem(index, 'quantity', e.target.value)}
                              min="0.01"
                              step="0.01"
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              required
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              placeholder="Price"
                              value={item.unit_price}
                              onChange={(e) => updateInvoiceItem(index, 'unit_price', e.target.value)}
                              min="0"
                              step="0.01"
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                              required
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              placeholder="Tax %"
                              value={item.tax_rate}
                              onChange={(e) => updateInvoiceItem(index, 'tax_rate', e.target.value)}
                              min="0"
                              max="100"
                              step="0.01"
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                            />
                          </div>
                          <div className="col-span-2 flex gap-1">
                            <span className="flex-1 p-2 text-sm text-gray-700 bg-white rounded-md border">
                              {formatCurrency((item.quantity * item.unit_price * (1 - item.discount_percent / 100)) + (item.tax_amount || 0))}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeInvoiceItem(index)}
                              className="px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {invoiceForm.items.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No items added. Click "Add Item" to start.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={invoiceForm.notes}
                      onChange={(e) => setInvoiceForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      rows="3"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowInvoiceForm(false);
                        setInvoiceForm({
                          customer_id: '',
                          invoice_date: new Date().toISOString().split('T')[0],
                          due_date: '',
                          notes: '',
                          items: []
                        });
                      }}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={invoiceForm.items.length === 0}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:bg-gray-400"
                    >
                      Create Invoice
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
