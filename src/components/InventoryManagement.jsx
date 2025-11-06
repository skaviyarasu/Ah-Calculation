import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { inventory, auth, rbac } from '../lib/supabase';
import { useRole } from '../hooks/useRole';
import Barcode from './Barcode';

export default function InventoryManagement() {
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [salesTransactions, setSalesTransactions] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('items'); // items, transactions, sales, low-stock
  const [showSalesForm, setShowSalesForm] = useState(false);
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
  const [showItemForm, setShowItemForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  
  // Use useRole hook for permission checks
  const { isAdmin, canViewInventory, canManageInventory, hasPermission, loading: roleLoading } = useRole();
  const [isCreator, setIsCreator] = useState(false);

  // Form states
  const [itemForm, setItemForm] = useState({
    item_code: '',
    item_name: '',
    description: '',
    category: 'battery_cell',
    unit: 'pcs',
    capacity_mah: '',
    voltage: '',
    manufacturer: '',
    supplier: '',
    cost_per_unit: '',
    selling_price: '',
    cost_method: 'weighted_average',
    min_stock_level: 0,
    max_stock_level: '',
    location: '',
    status: 'active',
    notes: '',
    image_url: '',
    serial_number: ''
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedItemForBarcode, setSelectedItemForBarcode] = useState(null);

  const [transactionForm, setTransactionForm] = useState({
    item_id: '',
    transaction_type: 'in',
    quantity: '',
    unit_price: '',
    reference_number: '',
    reference_type: '',
    notes: ''
  });

  useEffect(() => {
    checkCreatorRole();
    if (canViewInventory) {
      loadData();
    }
  }, [canViewInventory]);

  async function checkCreatorRole() {
    try {
      const user = await auth.getCurrentUser();
      if (user) {
        const creator = await rbac.isCreator(user.id);
        setIsCreator(creator);
      }
    } catch (error) {
      console.error('Error checking creator role:', error);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const [itemsData, transactionsData, salesData, lowStockData] = await Promise.all([
        inventory.getAllItems(),
        inventory.getAllTransactions(),
        inventory.getAllSalesTransactions(),
        inventory.getLowStockItems()
      ]);
      setItems(itemsData || []);
      setTransactions(transactionsData || []);
      setSalesTransactions(salesData || []);
      setLowStockItems(lowStockData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load inventory data: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  const canEdit = canManageInventory || isAdmin || isCreator;

  // Filter items
  const filteredItems = items.filter(item => {
    const matchesSearch = !searchQuery || 
      item.item_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.item_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Handle item form
  function handleItemFormChange(e) {
    const { name, value } = e.target;
    setItemForm(prev => ({
      ...prev,
      [name]: value === '' ? '' : (name.includes('_level') || name === 'capacity_mah' || name === 'voltage' || name === 'cost_per_unit' || name === 'selling_price' ? parseFloat(value) || '' : value)
    }));
  }

  async function handleItemSubmit(e) {
    e.preventDefault();
    setUploadingImage(true);
    try {
      let imageUrl = itemForm.image_url;
      
      // Upload image if a new file is selected
      if (imageFile) {
        const tempId = editingItem ? editingItem.id : Date.now().toString();
        imageUrl = await inventory.uploadImage(imageFile, tempId);
      }
      
      const itemData = {
        ...itemForm,
        image_url: imageUrl,
        capacity_mah: itemForm.capacity_mah ? parseFloat(itemForm.capacity_mah) : null,
        voltage: itemForm.voltage ? parseFloat(itemForm.voltage) : null,
        cost_per_unit: itemForm.cost_per_unit ? parseFloat(itemForm.cost_per_unit) : null,
        selling_price: itemForm.selling_price ? parseFloat(itemForm.selling_price) : null,
        min_stock_level: parseInt(itemForm.min_stock_level) || 0,
        max_stock_level: itemForm.max_stock_level ? parseInt(itemForm.max_stock_level) : null
      };

      let savedItem;
      if (editingItem) {
        savedItem = await inventory.updateItem(editingItem.id, itemData);
      } else {
        savedItem = await inventory.createItem(itemData);
      }
      
      await loadData();
      setShowItemForm(false);
      setEditingItem(null);
      setImageFile(null);
      setImagePreview(null);
      setItemForm({
        item_code: '',
        item_name: '',
        description: '',
        category: 'battery_cell',
        unit: 'pcs',
        capacity_mah: '',
        voltage: '',
        manufacturer: '',
        supplier: '',
        cost_per_unit: '',
        selling_price: '',
        min_stock_level: 0,
        max_stock_level: '',
        location: '',
        status: 'active',
        notes: '',
        image_url: '',
        serial_number: ''
      });
    } catch (error) {
      console.error('Error saving item:', error);
      alert('Failed to save item: ' + error.message);
    } finally {
      setUploadingImage(false);
    }
  }

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should be less than 5MB');
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleEditItem(item) {
    setEditingItem(item);
    setItemForm({
      item_code: item.item_code || '',
      item_name: item.item_name || '',
      description: item.description || '',
      category: item.category || 'battery_cell',
      unit: item.unit || 'pcs',
      capacity_mah: item.capacity_mah || '',
      voltage: item.voltage || '',
      manufacturer: item.manufacturer || '',
      supplier: item.supplier || '',
      cost_per_unit: item.cost_per_unit || '',
      selling_price: item.selling_price || '',
      cost_method: item.cost_method || 'weighted_average',
      min_stock_level: item.min_stock_level || 0,
      max_stock_level: item.max_stock_level || '',
      location: item.location || '',
      status: item.status || 'active',
      notes: item.notes || '',
      image_url: item.image_url || '',
      serial_number: item.serial_number || ''
    });
    setImagePreview(item.image_url || null);
    setImageFile(null);
    setShowItemForm(true);
  }

  function handleShowBarcode(item) {
    setSelectedItemForBarcode(item);
    setShowBarcodeModal(true);
  }

  async function handleDeleteItem(itemId) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await inventory.deleteItem(itemId);
      await loadData();
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item: ' + error.message);
    }
  }

  // Handle transaction form
  function handleTransactionFormChange(e) {
    const { name, value } = e.target;
    setTransactionForm(prev => ({
      ...prev,
      [name]: value === '' ? '' : (name === 'quantity' || name === 'unit_price' ? parseFloat(value) || '' : value)
    }));
  }

  async function handleTransactionSubmit(e) {
    e.preventDefault();
    try {
      const transactionData = {
        ...transactionForm,
        item_id: transactionForm.item_id,
        transaction_type: transactionForm.transaction_type,
        quantity: parseInt(transactionForm.quantity),
        unit_price: transactionForm.unit_price ? parseFloat(transactionForm.unit_price) : null,
        reference_number: transactionForm.reference_number || null,
        reference_type: transactionForm.reference_type || null,
        notes: transactionForm.notes || null
      };

      await inventory.createTransaction(transactionData);
      await loadData();
      setShowTransactionForm(false);
      setTransactionForm({
        item_id: '',
        transaction_type: 'in',
        quantity: '',
        unit_price: '',
        reference_number: '',
        reference_type: '',
        notes: ''
      });
    } catch (error) {
      console.error('Error creating transaction:', error);
      alert('Failed to create transaction: ' + error.message);
    }
  }

  // Handle sales form
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

  function getStockStatus(item) {
    if (item.current_stock <= item.min_stock_level) return 'low';
    if (item.max_stock_level && item.current_stock >= item.max_stock_level) return 'high';
    return 'normal';
  }

  function getStockStatusColor(status) {
    switch (status) {
      case 'low': return 'bg-red-100 text-red-800 border-red-300';
      case 'high': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default: return 'bg-green-100 text-green-800 border-green-300';
    }
  }

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading inventory...</p>
        </div>
      </div>
    );
  }

  // Check if user has permission to view inventory
  if (!canViewInventory) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center border border-red-200">
          <div className="text-red-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-4">You do not have permission to access the Inventory Management module.</p>
          <p className="text-sm text-gray-500">Please contact an administrator to grant you inventory access permissions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-lg p-6 space-y-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Inventory Management</h1>
              <p className="text-gray-600 mt-1">Track and manage battery cells and components</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingItem(null);
                  setItemForm({
                    item_code: '',
                    item_name: '',
                    description: '',
                    category: 'battery_cell',
                    unit: 'pcs',
                    capacity_mah: '',
                    voltage: '',
                    manufacturer: '',
                    supplier: '',
                    cost_per_unit: '',
                    selling_price: '',
                    min_stock_level: 0,
                    max_stock_level: '',
                    location: '',
                    status: 'active',
                    notes: '',
                    image_url: '',
                    serial_number: ''
                  });
                  setImageFile(null);
                  setImagePreview(null);
                  setShowItemForm(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium"
              >
                + Add Item
              </button>
              <button
                onClick={() => setShowTransactionForm(true)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium"
              >
                + New Transaction
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setActiveTab('items')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'items'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Items ({items.length})
            </button>
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'transactions'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Transactions ({transactions.length})
            </button>
            <button
              onClick={() => setActiveTab('sales')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'sales'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Sales
            </button>
            <button
              onClick={() => setActiveTab('low-stock')}
              className={`px-4 py-2 font-medium transition-colors relative ${
                activeTab === 'low-stock'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Low Stock
              {lowStockItems.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                  {lowStockItems.length}
                </span>
              )}
            </button>
          </div>

          {/* Items Tab */}
          {activeTab === 'items' && (
            <div className="space-y-4">
              {/* Search and Filter */}
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Categories</option>
                  <option value="battery_cell">Battery Cells</option>
                  <option value="component">Components</option>
                  <option value="accessory">Accessories</option>
                </select>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Barcode</th>
                      {canEdit && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredItems.map((item) => {
                      const stockStatus = getStockStatus(item);
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            {item.image_url ? (
                              <img 
                                src={item.image_url} 
                                alt={item.item_name}
                                className="w-16 h-16 object-cover rounded border border-gray-200"
                                onError={(e) => {
                                  e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="64" height="64" fill="%23e5e7eb"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="10"%3ENo Image%3C/text%3E%3C/svg%3E';
                                }}
                              />
                            ) : (
                              <div className="w-16 h-16 bg-gray-100 rounded border border-gray-200 flex items-center justify-center">
                                <span className="text-xs text-gray-400">No Image</span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.item_code}</td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-700">
                            {item.serial_number || <span className="text-gray-400">-</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{item.item_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 capitalize">{item.category?.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStockStatusColor(stockStatus)}`}>
                              {item.current_stock} {item.unit}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              item.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">{item.location || '-'}</td>
                          <td className="px-4 py-3 text-sm">
                            {item.serial_number ? (
                              <button
                                onClick={() => handleShowBarcode(item)}
                                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-medium transition-colors"
                                title="View Barcode"
                              >
                                📊 Barcode
                              </button>
                            ) : (
                              <span className="text-gray-400 text-xs">No Serial</span>
                            )}
                          </td>
                          {canEdit && (
                            <td className="px-4 py-3 text-sm">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditItem(item)}
                                  className="text-blue-600 hover:text-blue-800"
                                >
                                  Edit
                                </button>
                                {isAdmin && (
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="text-red-600 hover:text-red-800"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredItems.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No items found. {canEdit && 'Click "Add Item" to create one.'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {transactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {new Date(transaction.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {transaction.inventory_items?.item_name || transaction.item_id}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            transaction.transaction_type === 'in' 
                              ? 'bg-green-100 text-green-800' 
                              : transaction.transaction_type === 'out'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {transaction.transaction_type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{transaction.quantity}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {transaction.unit_price ? `$${transaction.unit_price.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{transaction.reference_number || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transactions.length === 0 && (
                  <div className="text-center py-8 text-gray-500">No transactions found.</div>
                )}
              </div>
            </div>
          )}

          {/* Sales Tab */}
          {activeTab === 'sales' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">Sales Transactions</h2>
                <button
                  onClick={() => setShowSalesForm(true)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors font-medium"
                >
                  + New Sale
                </button>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <p className="text-sm text-blue-800">
                  💡 <strong>Note:</strong> Sales transactions automatically calculate COGS based on the item's cost method (FIFO, LIFO, or Weighted Average).
                  Revenue, COGS, and gross profit are calculated automatically.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">COGS</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Profit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {salesTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-4 py-8 text-center text-gray-500">
                          No sales transactions yet. Click "New Sale" to create one.
                        </td>
                      </tr>
                    ) : (
                      salesTransactions.map((sale) => (
                        <tr key={sale.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {new Date(sale.transaction_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {sale.inventory_items?.item_code || 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {sale.customer_name || 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                            {sale.quantity}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-blue-600 font-medium">
                            ₹{sale.total_revenue?.toFixed(2) || '0.00'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600 font-medium">
                            ₹{sale.total_cogs?.toFixed(2) || '0.00'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                            ₹{sale.gross_profit?.toFixed(2) || '0.00'}
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
                </table>
              </div>
            </div>
          )}

          {/* Low Stock Tab */}
          {activeTab === 'low-stock' && (
            <div className="space-y-4">
              {lowStockItems.length > 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Warning:</strong> {lowStockItems.length} item(s) are at or below minimum stock level.
                  </p>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-green-800">All items are above minimum stock level.</p>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Min Level</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deficit</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {lowStockItems.map((item) => {
                      const deficit = item.min_stock_level - item.current_stock;
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.item_code}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{item.item_name}</td>
                          <td className="px-4 py-3 text-sm text-red-600 font-medium">{item.current_stock}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{item.min_stock_level}</td>
                          <td className="px-4 py-3 text-sm text-red-600 font-bold">{deficit} units</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Item Form Modal */}
          {showItemForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  {editingItem ? 'Edit Item' : 'Add New Item'}
                </h2>
                <form onSubmit={handleItemSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item Code *</label>
                      <input
                        type="text"
                        name="item_code"
                        value={itemForm.item_code}
                        onChange={handleItemFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                      <input
                        type="text"
                        name="item_name"
                        value={itemForm.item_name}
                        onChange={handleItemFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      name="description"
                      value={itemForm.description}
                      onChange={handleItemFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md"
                      rows="2"
                    />
                  </div>
                  
                  {/* Image Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Item Image</label>
                    <div className="flex gap-4 items-start">
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        />
                        <p className="text-xs text-gray-500 mt-1">Max size: 5MB (JPG, PNG, etc.)</p>
                      </div>
                      {(imagePreview || itemForm.image_url) && (
                        <div className="w-24 h-24 border border-gray-300 rounded overflow-hidden">
                          <img 
                            src={imagePreview || itemForm.image_url} 
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Serial Number Display (Auto-generated) */}
                  {editingItem && itemForm.serial_number && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Serial Number (5S Tracking)</label>
                      <div className="p-2 bg-gray-50 border border-gray-300 rounded-md font-mono text-sm">
                        {itemForm.serial_number}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Serial number is auto-generated for 5S tracking</p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                      <select
                        name="category"
                        value={itemForm.category}
                        onChange={handleItemFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        <option value="battery_cell">Battery Cell</option>
                        <option value="component">Component</option>
                        <option value="accessory">Accessory</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                      <input
                        type="text"
                        name="unit"
                        value={itemForm.unit}
                        onChange={handleItemFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                      <select
                        name="status"
                        value={itemForm.status}
                        onChange={handleItemFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      >
                        <option value="active">Active</option>
                        <option value="discontinued">Discontinued</option>
                        <option value="obsolete">Obsolete</option>
                      </select>
                    </div>
                  </div>
                  {itemForm.category === 'battery_cell' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Capacity (mAh)</label>
                        <input
                          type="number"
                          name="capacity_mah"
                          value={itemForm.capacity_mah}
                          onChange={handleItemFormChange}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Voltage</label>
                        <input
                          type="number"
                          step="0.1"
                          name="voltage"
                          value={itemForm.voltage}
                          onChange={handleItemFormChange}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                      <input
                        type="text"
                        name="manufacturer"
                        value={itemForm.manufacturer}
                        onChange={handleItemFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                      <input
                        type="text"
                        name="supplier"
                        value={itemForm.supplier}
                        onChange={handleItemFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cost per Unit</label>
                      <input
                        type="number"
                        step="0.01"
                        name="cost_per_unit"
                        value={itemForm.cost_per_unit}
                        onChange={handleItemFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price</label>
                      <input
                        type="number"
                        step="0.01"
                        name="selling_price"
                        value={itemForm.selling_price}
                        onChange={handleItemFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Cost Method *</label>
                      <select
                        name="cost_method"
                        value={itemForm.cost_method}
                        onChange={handleItemFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        required
                      >
                        <option value="weighted_average">Weighted Average</option>
                        <option value="fifo">FIFO (First In, First Out)</option>
                        <option value="lifo">LIFO (Last In, First Out)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Used for COGS calculation</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input
                        type="text"
                        name="location"
                        value={itemForm.location}
                        onChange={handleItemFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock Level *</label>
                      <input
                        type="number"
                        name="min_stock_level"
                        value={itemForm.min_stock_level}
                        onChange={handleItemFormChange}
                        required
                        min="0"
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Max Stock Level</label>
                      <input
                        type="number"
                        name="max_stock_level"
                        value={itemForm.max_stock_level}
                        onChange={handleItemFormChange}
                        min="0"
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      name="notes"
                      value={itemForm.notes}
                      onChange={handleItemFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md"
                      rows="2"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowItemForm(false);
                        setEditingItem(null);
                      }}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={uploadingImage}
                      className={`px-4 py-2 rounded-md text-white ${
                        uploadingImage 
                          ? 'bg-blue-400 cursor-not-allowed' 
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {uploadingImage ? 'Uploading...' : (editingItem ? 'Update' : 'Create') + ' Item'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Transaction Form Modal */}
          {showTransactionForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">New Transaction</h2>
                <form onSubmit={handleTransactionSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
                    <select
                      name="item_id"
                      value={transactionForm.item_id}
                      onChange={handleTransactionFormChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded-md"
                    >
                      <option value="">Select an item</option>
                      {items.filter(i => i.status === 'active').map(item => (
                        <option key={item.id} value={item.id}>
                          {item.item_code} - {item.item_name} (Stock: {item.current_stock})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type *</label>
                    <select
                      name="transaction_type"
                      value={transactionForm.transaction_type}
                      onChange={handleTransactionFormChange}
                      required
                      className="w-full p-2 border border-gray-300 rounded-md"
                    >
                      <option value="in">Stock In</option>
                      <option value="out">Stock Out</option>
                      <option value="adjustment">Adjustment</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                    <input
                      type="number"
                      name="quantity"
                      value={transactionForm.quantity}
                      onChange={handleTransactionFormChange}
                      required
                      min="1"
                      className="w-full p-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Price</label>
                    <input
                      type="number"
                      step="0.01"
                      name="unit_price"
                      value={transactionForm.unit_price}
                      onChange={handleTransactionFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                    <input
                      type="text"
                      name="reference_number"
                      value={transactionForm.reference_number}
                      onChange={handleTransactionFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference Type</label>
                    <select
                      name="reference_type"
                      value={transactionForm.reference_type}
                      onChange={handleTransactionFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md"
                    >
                      <option value="">Select type</option>
                      <option value="purchase_order">Purchase Order</option>
                      <option value="job_card">Job Card</option>
                      <option value="adjustment">Adjustment</option>
                      <option value="transfer">Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      name="notes"
                      value={transactionForm.notes}
                      onChange={handleTransactionFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md"
                      rows="2"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowTransactionForm(false)}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
                    >
                      Create Transaction
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Barcode Modal */}
          {showBarcodeModal && selectedItemForBarcode && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">Barcode - {selectedItemForBarcode.item_name}</h2>
                  <button
                    onClick={() => {
                      setShowBarcodeModal(false);
                      setSelectedItemForBarcode(null);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-md">
                    <div className="text-sm text-gray-600 mb-2">Item Information:</div>
                    <div className="space-y-1 text-sm">
                      <div><strong>Item Code:</strong> {selectedItemForBarcode.item_code}</div>
                      <div><strong>Serial Number:</strong> <span className="font-mono">{selectedItemForBarcode.serial_number}</span></div>
                      <div><strong>Name:</strong> {selectedItemForBarcode.item_name}</div>
                      {selectedItemForBarcode.location && (
                        <div><strong>Location:</strong> {selectedItemForBarcode.location}</div>
                      )}
                    </div>
                  </div>
                  <div className="border-2 border-gray-300 p-6 rounded-md bg-white flex flex-col items-center">
                    <div className="mb-4 text-sm text-gray-600 font-medium">5S Tracking Barcode</div>
                    <Barcode 
                      value={selectedItemForBarcode.serial_number || selectedItemForBarcode.item_code}
                      format="CODE128"
                      width={2}
                      height={60}
                      displayValue={true}
                    />
                    <div className="mt-4 text-xs text-gray-500 text-center font-mono">
                      {selectedItemForBarcode.serial_number || selectedItemForBarcode.item_code}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => {
                        setShowBarcodeModal(false);
                        setSelectedItemForBarcode(null);
                      }}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => {
                        window.print();
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                    >
                      Print Barcode
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sales Form Modal */}
          {showSalesForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">Record New Sale</h2>
                <form onSubmit={handleSalesSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item *</label>
                      <select
                        name="item_id"
                        value={salesForm.item_id}
                        onChange={handleSalesFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md"
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
                        className="w-full p-2 border border-gray-300 rounded-md"
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
                        className="w-full p-2 border border-gray-300 rounded-md"
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
                        className="w-full p-2 border border-gray-300 rounded-md"
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
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                      <input
                        type="text"
                        name="invoice_number"
                        value={salesForm.invoice_number}
                        onChange={handleSalesFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md"
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
                      className="w-full p-2 border border-gray-300 rounded-md"
                      placeholder="Job card, order number, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      name="notes"
                      value={salesForm.notes}
                      onChange={handleSalesFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md"
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
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md"
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

