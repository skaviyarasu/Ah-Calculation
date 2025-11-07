import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { accounting, inventory, auth } from '../lib/supabase';
import { useRole } from '../hooks/useRole';

export default function PurchasesModule() {
  const [activeTab, setActiveTab] = useState('bills'); // 'pos' or 'bills'
  const [bills, setBills] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showBillForm, setShowBillForm] = useState(false);
  const [showPOForm, setShowPOForm] = useState(false);

  const { canViewInventory } = useRole();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const user = await auth.getCurrentUser();
    setIsAuthenticated(!!user);
  }

  const [billForm, setBillForm] = useState({
    vendor_id: '',
    bill_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
    terms_and_conditions: ''
  });

  const [billItems, setBillItems] = useState([]);

  const [poForm, setPOForm] = useState({
    vendor_id: '',
    po_date: new Date().toISOString().split('T')[0],
    expected_date: '',
    notes: '',
    terms_and_conditions: ''
  });

  const [poItems, setPOItems] = useState([]);

  useEffect(() => {
    if (canViewInventory) {
      loadData();
    }
  }, [canViewInventory, activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      const [billsData, posData, vendorsData, itemsData] = await Promise.all([
        accounting.getAllBills(),
        accounting.getAllPurchaseOrders(),
        accounting.getAllContacts({ contact_type: 'vendor', status: 'active' }),
        inventory.getAllItems()
      ]);

      setBills(billsData || []);
      setPurchaseOrders(posData || []);
      setVendors(vendorsData || []);
      setItems(itemsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount || 0);
  }

  // Bill form handlers
  function addBillItem() {
    setBillItems(prev => [...prev, {
      item_id: '',
      description: '',
      quantity: 1,
      unit_price: 0,
      discount_percent: 0,
      tax_rate: 0
    }]);
  }

  function updateBillItem(index, field, value) {
    setBillItems(prev => {
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

  function removeBillItem(index) {
    setBillItems(prev => prev.filter((_, i) => i !== index));
  }

  async function handleBillSubmit(e) {
    e.preventDefault();
    try {
      if (billItems.length === 0) {
        alert('Please add at least one item to the bill.');
        return;
      }

      // Create bill
      const bill = await accounting.createBill({
        vendor_id: billForm.vendor_id,
        bill_date: billForm.bill_date,
        due_date: billForm.due_date || null,
        notes: billForm.notes || null,
        terms_and_conditions: billForm.terms_and_conditions || null
      });

      // Add bill items
      for (const item of billItems) {
        await accounting.addBillItem(bill.id, item);
      }

      await loadData();
      setShowBillForm(false);
      setBillForm({
        vendor_id: '',
        bill_date: new Date().toISOString().split('T')[0],
        due_date: '',
        notes: '',
        terms_and_conditions: ''
      });
      setBillItems([]);
      alert('Bill created successfully!');
    } catch (error) {
      console.error('Error creating bill:', error);
      alert('Failed to create bill: ' + error.message);
    }
  }

  // PO form handlers
  function addPOItem() {
    setPOItems(prev => [...prev, {
      item_id: '',
      description: '',
      quantity: 1,
      unit_price: 0,
      discount_percent: 0,
      tax_rate: 0
    }]);
  }

  function updatePOItem(index, field, value) {
    setPOItems(prev => {
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

  function removePOItem(index) {
    setPOItems(prev => prev.filter((_, i) => i !== index));
  }

  async function handlePOSubmit(e) {
    e.preventDefault();
    try {
      if (poItems.length === 0) {
        alert('Please add at least one item to the purchase order.');
        return;
      }

      // Create purchase order
      const po = await accounting.createPurchaseOrder({
        vendor_id: poForm.vendor_id,
        po_date: poForm.po_date,
        expected_date: poForm.expected_date || null,
        notes: poForm.notes || null,
        terms_and_conditions: poForm.terms_and_conditions || null
      });

      // Add PO items
      for (const item of poItems) {
        await accounting.addPurchaseOrderItem(po.id, item);
      }

      await loadData();
      setShowPOForm(false);
      setPOForm({
        vendor_id: '',
        po_date: new Date().toISOString().split('T')[0],
        expected_date: '',
        notes: '',
        terms_and_conditions: ''
      });
      setPOItems([]);
      alert('Purchase Order created successfully!');
    } catch (error) {
      console.error('Error creating purchase order:', error);
      alert('Failed to create purchase order: ' + error.message);
    }
  }

  if (loading) {
    return (
      <div className="py-8 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading purchases...</p>
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
              <h2 className="text-2xl font-bold text-gray-900">Purchases</h2>
              {isAuthenticated && (
                <div className="flex gap-2">
                  {activeTab === 'bills' && (
                    <button
                      onClick={() => setShowBillForm(true)}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium shadow-md"
                    >
                      + Create Bill
                    </button>
                  )}
                  {activeTab === 'pos' && (
                    <button
                      onClick={() => setShowPOForm(true)}
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium shadow-md"
                    >
                      + Create Purchase Order
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b">
              <button
                onClick={() => setActiveTab('bills')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'bills'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Bills ({bills.length})
              </button>
              <button
                onClick={() => setActiveTab('pos')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'pos'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Purchase Orders ({purchaseOrders.length})
              </button>
            </div>
          </div>

          {/* Bills Tab */}
          {activeTab === 'bills' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Vendor Bills</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bill #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {bills.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                          No bills found. Click "Create Bill" to get started.
                        </td>
                      </tr>
                    ) : (
                      bills.map((bill) => (
                        <tr key={bill.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {bill.bill_number}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {new Date(bill.bill_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {bill.contacts?.company_name || bill.contacts?.contact_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                            {formatCurrency(bill.total_amount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600">
                            {formatCurrency(bill.paid_amount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600 font-medium">
                            {formatCurrency(bill.balance_amount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              bill.status === 'paid' ? 'bg-green-100 text-green-800' :
                              bill.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                              bill.status === 'overdue' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {bill.status}
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

          {/* Purchase Orders Tab */}
          {activeTab === 'pos' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Purchase Orders</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {purchaseOrders.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                          No purchase orders found. Click "Create Purchase Order" to get started.
                        </td>
                      </tr>
                    ) : (
                      purchaseOrders.map((po) => (
                        <tr key={po.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                            {po.po_number}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {new Date(po.po_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {po.contacts?.company_name || po.contacts?.contact_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                            {formatCurrency(po.total_amount)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              po.status === 'received' ? 'bg-green-100 text-green-800' :
                              po.status === 'acknowledged' ? 'bg-blue-100 text-blue-800' :
                              po.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {po.status}
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

          {/* Bill Form Modal */}
          {showBillForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">Create Bill</h2>
                  <button
                    onClick={() => setShowBillForm(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={handleBillSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
                      <select
                        value={billForm.vendor_id}
                        onChange={(e) => setBillForm(prev => ({ ...prev, vendor_id: e.target.value }))}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Vendor</option>
                        {vendors.map(vendor => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendor.company_name || vendor.contact_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bill Date *</label>
                      <input
                        type="date"
                        value={billForm.bill_date}
                        onChange={(e) => setBillForm(prev => ({ ...prev, bill_date: e.target.value }))}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                    <input
                      type="date"
                      value={billForm.due_date}
                      onChange={(e) => setBillForm(prev => ({ ...prev, due_date: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Bill Items */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">Items *</label>
                      <button
                        type="button"
                        onClick={addBillItem}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className="space-y-2">
                      {billItems.length > 0 && (
                        <div className="hidden md:grid grid-cols-12 gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <span className="col-span-4">Item</span>
                          <span className="col-span-2">Qty</span>
                          <span className="col-span-2">Unit Cost</span>
                          <span className="col-span-2">Tax %</span>
                          <span className="col-span-2 text-right">Line Total</span>
                        </div>
                      )}
                      {billItems.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-md">
                          <div className="col-span-4">
                            <select
                              value={item.item_id}
                              onChange={(e) => {
                                const selectedItem = items.find(i => i.id === e.target.value);
                                updateBillItem(index, 'item_id', e.target.value);
                                if (selectedItem) {
                                  updateBillItem(index, 'unit_price', selectedItem.purchase_price || 0);
                                  updateBillItem(index, 'description', selectedItem.item_name);
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
                              onChange={(e) => updateBillItem(index, 'quantity', e.target.value)}
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
                              onChange={(e) => updateBillItem(index, 'unit_price', e.target.value)}
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
                              onChange={(e) => updateBillItem(index, 'tax_rate', e.target.value)}
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
                              onClick={() => removeBillItem(index)}
                              className="px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {billItems.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No items added. Click "Add Item" to start.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={billForm.notes}
                      onChange={(e) => setBillForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      rows="3"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowBillForm(false);
                        setBillForm({
                          vendor_id: '',
                          bill_date: new Date().toISOString().split('T')[0],
                          due_date: '',
                          notes: '',
                          terms_and_conditions: ''
                        });
                        setBillItems([]);
                      }}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={billItems.length === 0}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:bg-gray-400"
                    >
                      Create Bill
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Purchase Order Form Modal */}
          {showPOForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">Create Purchase Order</h2>
                  <button
                    onClick={() => setShowPOForm(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={handlePOSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
                      <select
                        value={poForm.vendor_id}
                        onChange={(e) => setPOForm(prev => ({ ...prev, vendor_id: e.target.value }))}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select Vendor</option>
                        {vendors.map(vendor => (
                          <option key={vendor.id} value={vendor.id}>
                            {vendor.company_name || vendor.contact_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">PO Date *</label>
                      <input
                        type="date"
                        value={poForm.po_date}
                        onChange={(e) => setPOForm(prev => ({ ...prev, po_date: e.target.value }))}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expected Date</label>
                    <input
                      type="date"
                      value={poForm.expected_date}
                      onChange={(e) => setPOForm(prev => ({ ...prev, expected_date: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* PO Items */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">Items *</label>
                      <button
                        type="button"
                        onClick={addPOItem}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className="space-y-2">
                      {poItems.length > 0 && (
                        <div className="hidden md:grid grid-cols-12 gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <span className="col-span-4">Item</span>
                          <span className="col-span-2">Qty</span>
                          <span className="col-span-2">Unit Cost</span>
                          <span className="col-span-2">Tax %</span>
                          <span className="col-span-2 text-right">Line Total</span>
                        </div>
                      )}
                      {poItems.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-md">
                          <div className="col-span-4">
                            <select
                              value={item.item_id}
                              onChange={(e) => {
                                const selectedItem = items.find(i => i.id === e.target.value);
                                updatePOItem(index, 'item_id', e.target.value);
                                if (selectedItem) {
                                  updatePOItem(index, 'unit_price', selectedItem.purchase_price || 0);
                                  updatePOItem(index, 'description', selectedItem.item_name);
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
                              onChange={(e) => updatePOItem(index, 'quantity', e.target.value)}
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
                              onChange={(e) => updatePOItem(index, 'unit_price', e.target.value)}
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
                              onChange={(e) => updatePOItem(index, 'tax_rate', e.target.value)}
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
                              onClick={() => removePOItem(index)}
                              className="px-2 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {poItems.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">No items added. Click "Add Item" to start.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      value={poForm.notes}
                      onChange={(e) => setPOForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      rows="3"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPOForm(false);
                        setPOForm({
                          vendor_id: '',
                          po_date: new Date().toISOString().split('T')[0],
                          expected_date: '',
                          notes: '',
                          terms_and_conditions: ''
                        });
                        setPOItems([]);
                      }}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={poItems.length === 0}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors disabled:bg-gray-400"
                    >
                      Create Purchase Order
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
