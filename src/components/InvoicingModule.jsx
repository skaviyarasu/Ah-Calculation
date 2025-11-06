import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { accounting, inventory } from '../lib/supabase';
import { useRole } from '../hooks/useRole';

export default function InvoicingModule() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const { canViewInventory, canManageInventory } = useRole();

  const [invoiceForm, setInvoiceForm] = useState({
    customer_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
    terms_and_conditions: ''
  });

  const [invoiceItems, setInvoiceItems] = useState([]);

  useEffect(() => {
    if (canViewInventory) {
      loadData();
    }
  }, [canViewInventory, filterStatus]);

  async function loadData() {
    setLoading(true);
    try {
      const filters = {};
      if (filterStatus !== 'all') {
        filters.status = filterStatus;
      }

      const [invoicesData, customersData, itemsData, taxRatesData] = await Promise.all([
        accounting.getAllInvoices(filters),
        accounting.getAllContacts({ contact_type: 'customer', status: 'active' }),
        inventory.getAllItems(),
        accounting.getAllTaxRates()
      ]);

      setInvoices(invoicesData || []);
      setCustomers(customersData || []);
      setItems(itemsData || []);
      setTaxRates(taxRatesData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleInvoiceFormChange(e) {
    const { name, value } = e.target;
    setInvoiceForm(prev => ({
      ...prev,
      [name]: value
    }));
  }

  function addInvoiceItem() {
    setInvoiceItems(prev => [...prev, {
      item_id: '',
      description: '',
      quantity: 1,
      unit_price: 0,
      discount_percent: 0,
      tax_rate: 0
    }]);
  }

  function updateInvoiceItem(index, field, value) {
    setInvoiceItems(prev => {
      const updated = [...prev];
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
      
      return updated;
    });
  }

  function removeInvoiceItem(index) {
    setInvoiceItems(prev => prev.filter((_, i) => i !== index));
  }

  async function handleCreateInvoice(e) {
    e.preventDefault();
    try {
      // Create invoice
      const invoice = await accounting.createInvoice(invoiceForm);

      // Add invoice items
      for (const item of invoiceItems) {
        await accounting.addInvoiceItem(invoice.id, item);
      }

      await loadData();
      setShowInvoiceForm(false);
      setInvoiceForm({
        customer_id: '',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: '',
        notes: '',
        terms_and_conditions: ''
      });
      setInvoiceItems([]);
      alert('Invoice created successfully!');
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice: ' + error.message);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  }

  function getStatusColor(status) {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading invoices...</p>
        </div>
      </div>
    );
  }

  if (!canViewInventory) {
    return (
      <div className="py-8 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center border border-red-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You do not have permission to access this module.</p>
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
              <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
              {canManageInventory && (
                <button
                  onClick={() => setShowInvoiceForm(true)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium shadow-md"
                >
                  + Create Invoice
                </button>
              )}
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              {['all', 'draft', 'sent', 'paid', 'partial', 'overdue'].map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    filterStatus === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Total Invoices</h3>
              <p className="text-3xl font-bold text-blue-600">{invoices.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Total Amount</h3>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0))}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Outstanding</h3>
              <p className="text-3xl font-bold text-yellow-600">
                {formatCurrency(invoices.reduce((sum, inv) => sum + (inv.balance_amount || 0), 0))}
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Overdue</h3>
              <p className="text-3xl font-bold text-red-600">
                {formatCurrency(invoices.filter(inv => inv.status === 'overdue').reduce((sum, inv) => sum + (inv.balance_amount || 0), 0))}
              </p>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Invoices</h2>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoices.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                        No invoices found. {canManageInventory && 'Click "Create Invoice" to get started.'}
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
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(invoice.status)}`}>
                            {invoice.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <button
                            onClick={() => setSelectedInvoice(invoice)}
                            className="text-blue-600 hover:text-blue-800 mr-3"
                          >
                            View
                          </button>
                          {canManageInventory && invoice.status !== 'paid' && (
                            <button
                              onClick={() => {/* Open payment modal */}}
                              className="text-green-600 hover:text-green-800"
                            >
                              Record Payment
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Invoice Form Modal */}
          {showInvoiceForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">Create New Invoice</h2>
                  <button
                    onClick={() => setShowInvoiceForm(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={handleCreateInvoice} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                      <select
                        name="customer_id"
                        value={invoiceForm.customer_id}
                        onChange={handleInvoiceFormChange}
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
                        name="invoice_date"
                        value={invoiceForm.invoice_date}
                        onChange={handleInvoiceFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      name="due_date"
                      value={invoiceForm.due_date}
                      onChange={handleInvoiceFormChange}
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
                      {invoiceItems.map((item, index) => (
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
                    {invoiceItems.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No items added. Click "Add Item" to start.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      name="notes"
                      value={invoiceForm.notes}
                      onChange={handleInvoiceFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      rows="3"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowInvoiceForm(false)}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={invoiceItems.length === 0}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:bg-gray-400"
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

