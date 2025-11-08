import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { inventory, auth, rbac } from '../lib/supabase';
import { useRole } from '../hooks/useRole';
import { useBranch } from '../hooks/useBranch';
import Barcode from './Barcode';

export default function InventoryManagement() {
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [lowStockItems, setLowStockItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [branchStock, setBranchStock] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [goodsReceipts, setGoodsReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('items'); // items, transactions, low-stock
  const [showItemForm, setShowItemForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [showPurchaseOrderForm, setShowPurchaseOrderForm] = useState(false);
  const [showGoodsReceiptForm, setShowGoodsReceiptForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  
  // Use useRole hook for permission checks
  const { isAdmin, canViewInventory, canManageInventory, hasPermission, loading: roleLoading } = useRole();
  const [isCreator, setIsCreator] = useState(false);
  const {
    currentBranch,
    loading: branchLoading
  } = useBranch();

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
    notes: '',
    location_id: '',
    target_location_id: ''
  });

  const [supplierForm, setSupplierForm] = useState({
    name: '',
    code: '',
    contact_name: '',
    email: '',
    phone: '',
    mobile: '',
    tax_number: '',
    gstin: '',
    pan: '',
    msme_number: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'India',
    notes: ''
  });

  const [locationForm, setLocationForm] = useState({
    name: '',
    code: '',
    description: '',
    is_default: false
  });

  const today = new Date().toISOString().split('T')[0];
  const [purchaseOrderForm, setPurchaseOrderForm] = useState({
    supplier_id: '',
    location_id: '',
    expected_date: today,
    reference_number: '',
    notes: ''
  });
  const [purchaseOrderItems, setPurchaseOrderItems] = useState([
    { item_id: '', quantity: '', unit_price: '' }
  ]);

  const [goodsReceiptForm, setGoodsReceiptForm] = useState({
    purchase_order_id: '',
    location_id: '',
    received_date: today,
    reference_number: '',
    notes: ''
  });
  const [goodsReceiptItems, setGoodsReceiptItems] = useState([
    { item_id: '', quantity: '', unit_price: '', purchase_order_item_id: null }
  ]);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);

  useEffect(() => {
    checkCreatorRole();
  }, []);

  useEffect(() => {
    if (canViewInventory && currentBranch) {
      loadData(currentBranch.id);
    } else {
      setLoading(false);
    }
  }, [canViewInventory, currentBranch]);

  useEffect(() => {
    if (!currentBranch?.id || locations.length === 0) return;
    const branchLocations = locations.filter(loc => loc.branch_id === currentBranch.id);
    if (branchLocations.length === 0) return;
    const defaultLocation = branchLocations.find(loc => loc.is_default) || branchLocations[0];
    if (!defaultLocation) return;
    setTransactionForm(prev => ({ ...prev, location_id: prev.location_id || defaultLocation.id }));
    setPurchaseOrderForm(prev => ({ ...prev, location_id: prev.location_id || defaultLocation.id }));
    setGoodsReceiptForm(prev => ({ ...prev, location_id: prev.location_id || defaultLocation.id }));
  }, [locations, currentBranch]);

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

  async function loadData(branchId) {
    if (!branchId) return;
    setLoading(true);
    try {
      const [
        itemsData,
        transactionsData,
        lowStockData,
        suppliersData,
        locationsData,
        purchaseOrdersData,
        goodsReceiptsData,
        branchStockData
      ] = await Promise.all([
        inventory.getAllItems({ branchId }),
        inventory.getAllTransactions({ branch_id: branchId }),
        inventory.getLowStockItems(),
        inventory.getSuppliers(),
        inventory.getLocations(branchId),
        inventory.getPurchaseOrders({ branch_id: branchId }),
        inventory.getGoodsReceipts({ branch_id: branchId }),
        inventory.getBranchStock(branchId)
      ]);
      setItems(itemsData || []);
      setTransactions(transactionsData || []);
      setLowStockItems(lowStockData || []);
      setSuppliers(suppliersData || []);
      setLocations(locationsData || []);
      setPurchaseOrders(purchaseOrdersData || []);
      setGoodsReceipts(goodsReceiptsData || []);
      setBranchStock(branchStockData || []);
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
      
      if (currentBranch?.id) {
        await loadData(currentBranch.id);
      }
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
      if (currentBranch?.id) {
        await loadData(currentBranch.id);
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item: ' + error.message);
    }
  }

  // Handle transaction form
  function handleTransactionFormChange(e) {
    const { name, value } = e.target;
    setTransactionForm(prev => {
      const next = {
        ...prev,
        [name]: ['quantity', 'unit_price'].includes(name)
          ? (value === '' ? '' : (parseFloat(value) || ''))
          : value
      };
      if (name === 'transaction_type' && value !== 'transfer') {
        next.target_location_id = '';
      }
      return next;
    });
  }

  async function handleTransactionSubmit(e) {
    e.preventDefault();
    if (!transactionForm.item_id) {
      alert('Select an item for the transaction.');
      return;
    }
    if (!transactionForm.quantity || Number(transactionForm.quantity) <= 0) {
      alert('Enter a valid quantity.');
      return;
    }
    if (['in', 'out', 'adjustment'].includes(transactionForm.transaction_type) && !transactionForm.location_id) {
      alert('Select a location for this transaction.');
      return;
    }
    if (transactionForm.transaction_type === 'transfer') {
      if (!transactionForm.location_id || !transactionForm.target_location_id) {
        alert('Select both source and target locations for a transfer.');
        return;
      }
      if (transactionForm.location_id === transactionForm.target_location_id) {
        alert('Source and target locations must be different.');
        return;
      }
    }
    try {
      const transactionData = {
        ...transactionForm,
        item_id: transactionForm.item_id,
        transaction_type: transactionForm.transaction_type,
        quantity: parseInt(transactionForm.quantity),
        unit_price: transactionForm.unit_price ? parseFloat(transactionForm.unit_price) : null,
        reference_number: transactionForm.reference_number || null,
        reference_type: transactionForm.reference_type || null,
        notes: transactionForm.notes || null,
        branch_id: currentBranch?.id || null
      };

      await inventory.createTransaction(transactionData);
      if (currentBranch?.id) {
        await loadData(currentBranch.id);
      }
      setShowTransactionForm(false);
      setTransactionForm({
        item_id: '',
        transaction_type: 'in',
        quantity: '',
        unit_price: '',
        reference_number: '',
        reference_type: '',
        notes: '',
        location_id: '',
        target_location_id: ''
      });
    } catch (error) {
      console.error('Error creating transaction:', error);
      alert('Failed to create transaction: ' + error.message);
    }
  }


  function handleSupplierFormChange(e) {
    const { name, value } = e.target
    setSupplierForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSupplierSubmit(e) {
    e.preventDefault()
    try {
      await inventory.createSupplier(supplierForm)
      setShowSupplierForm(false)
      setSupplierForm({
        name: '',
        code: '',
        contact_name: '',
        email: '',
        phone: '',
        mobile: '',
        tax_number: '',
        gstin: '',
        pan: '',
        msme_number: '',
        address: '',
        city: '',
        state: '',
        postal_code: '',
        country: 'India',
        notes: ''
      })
      if (currentBranch?.id) {
        await loadData(currentBranch.id)
      }
    } catch (error) {
      console.error('Error creating supplier:', error)
      alert('Failed to create supplier: ' + (error.message || 'Unknown error'))
    }
  }

  function handleLocationFormChange(e) {
    const { name, value, type, checked } = e.target
    setLocationForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  async function handleLocationSubmit(e) {
    e.preventDefault()
    if (!currentBranch?.id) {
      alert('Select a branch before creating locations.')
      return
    }
    try {
      const payload = {
        ...locationForm,
        branch_id: currentBranch.id
      }
      const created = await inventory.createLocation(payload)
      if (locationForm.is_default) {
        await inventory.setDefaultLocation(created.id, currentBranch.id)
      }
      setShowLocationForm(false)
      setLocationForm({ name: '', code: '', description: '', is_default: false })
      if (currentBranch?.id) {
        await loadData(currentBranch.id)
      }
    } catch (error) {
      console.error('Error creating location:', error)
      alert('Failed to create location: ' + (error.message || 'Unknown error'))
    }
  }

  function handlePurchaseOrderFormChange(e) {
    const { name, value } = e.target
    setPurchaseOrderForm(prev => ({ ...prev, [name]: value }))
  }

  function updatePurchaseOrderItem(index, field, value) {
    setPurchaseOrderItems(prev => prev.map((row, i) => (
      i === index ? { ...row, [field]: value } : row
    )))
  }

  function addPurchaseOrderItemRow() {
    setPurchaseOrderItems(prev => [...prev, { item_id: '', quantity: '', unit_price: '' }])
  }

  function removePurchaseOrderItemRow(index) {
    setPurchaseOrderItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }

  async function handlePurchaseOrderSubmit(e) {
    e.preventDefault()
    if (!currentBranch?.id) {
      alert('Select a branch before creating purchase orders.')
      return
    }
    const cleanedItems = purchaseOrderItems
      .filter(item => item.item_id && Number(item.quantity) > 0)
      .map(item => ({
        item_id: item.item_id,
        quantity: Number(item.quantity),
        unit_price: item.unit_price ? Number(item.unit_price) : null,
        notes: item.notes || null
      }))

    if (cleanedItems.length === 0) {
      alert('Add at least one item to the purchase order.')
      return
    }

    const orderPayload = {
      branch_id: currentBranch.id,
      supplier_id: purchaseOrderForm.supplier_id || null,
      location_id: purchaseOrderForm.location_id || null,
      expected_date: purchaseOrderForm.expected_date || null,
      reference_number: purchaseOrderForm.reference_number || null,
      notes: purchaseOrderForm.notes || null
    }

    try {
      await inventory.createPurchaseOrder(orderPayload, cleanedItems)
      setShowPurchaseOrderForm(false)
      setPurchaseOrderForm({
        supplier_id: '',
        location_id: purchaseOrderForm.location_id,
        expected_date: today,
        reference_number: '',
        notes: ''
      })
      setPurchaseOrderItems([{ item_id: '', quantity: '', unit_price: '' }])
      if (currentBranch?.id) {
        await loadData(currentBranch.id)
      }
    } catch (error) {
      console.error('Error creating purchase order:', error)
      alert('Failed to create purchase order: ' + (error.message || 'Unknown error'))
    }
  }

  function handleGoodsReceiptFormChange(e) {
    const { name, value } = e.target
    setGoodsReceiptForm(prev => ({ ...prev, [name]: value }))
  }

  function updateGoodsReceiptItem(index, field, value) {
    setGoodsReceiptItems(prev => prev.map((row, i) => (
      i === index ? { ...row, [field]: value } : row
    )))
  }

  function addGoodsReceiptItemRow() {
    setGoodsReceiptItems(prev => [...prev, { item_id: '', quantity: '', unit_price: '', purchase_order_item_id: null }])
  }

  function removeGoodsReceiptItemRow(index) {
    setGoodsReceiptItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev)
  }

  async function handleGoodsReceiptPurchaseOrderChange(purchaseOrderId) {
    setGoodsReceiptForm(prev => ({ ...prev, purchase_order_id: purchaseOrderId }))
    if (!purchaseOrderId) {
      setSelectedPurchaseOrder(null)
      setGoodsReceiptItems([{ item_id: '', quantity: '', unit_price: '', purchase_order_item_id: null }])
      return
    }
    try {
      const poDetails = await inventory.getPurchaseOrderById(purchaseOrderId)
      setSelectedPurchaseOrder(poDetails)
      const outstandingItems = (poDetails.purchase_order_items || []).map(item => {
        const remaining = Number(item.quantity || 0) - Number(item.received_quantity || 0)
        return {
          purchase_order_item_id: item.id,
          item_id: item.item_id,
          item_name: item.inventory_items?.item_name,
          ordered_quantity: Number(item.quantity || 0),
          received_quantity: Number(item.received_quantity || 0),
          quantity: remaining > 0 ? remaining : 0,
          unit_price: item.unit_price || 0
        }
      })
      setGoodsReceiptItems(outstandingItems.length ? outstandingItems : [{ item_id: '', quantity: '', unit_price: '', purchase_order_item_id: null }])
      if (poDetails.location_id) {
        setGoodsReceiptForm(prev => ({
          ...prev,
          purchase_order_id: purchaseOrderId,
          location_id: prev.location_id || poDetails.location_id
        }))
      }
    } catch (error) {
      console.error('Error loading purchase order:', error)
      alert('Failed to load purchase order: ' + (error.message || 'Unknown error'))
    }
  }

  async function handleGoodsReceiptSubmit(e) {
    e.preventDefault()
    if (!currentBranch?.id) {
      alert('Select a branch before recording receipts.')
      return
    }
    if (!goodsReceiptForm.location_id) {
      alert('Select a receiving location.')
      return
    }

    const cleanedItems = goodsReceiptItems
      .filter(item => item.item_id && Number(item.quantity) > 0)
      .map(item => ({
        purchase_order_item_id: item.purchase_order_item_id,
        item_id: item.item_id,
        quantity: Number(item.quantity),
        unit_price: item.unit_price ? Number(item.unit_price) : null
      }))

    if (cleanedItems.length === 0) {
      alert('Add at least one item to the receipt.')
      return
    }

    const payload = {
      branch_id: currentBranch.id,
      purchase_order_id: goodsReceiptForm.purchase_order_id || null,
      location_id: goodsReceiptForm.location_id,
      received_date: goodsReceiptForm.received_date || null,
      reference_number: goodsReceiptForm.reference_number || null,
      notes: goodsReceiptForm.notes || null
    }

    try {
      await inventory.recordGoodsReceipt(payload, cleanedItems)
      setShowGoodsReceiptForm(false)
      setGoodsReceiptForm({
        purchase_order_id: '',
        location_id: goodsReceiptForm.location_id,
        received_date: today,
        reference_number: '',
        notes: ''
      })
      setGoodsReceiptItems([{ item_id: '', quantity: '', unit_price: '', purchase_order_item_id: null }])
      setSelectedPurchaseOrder(null)
      if (currentBranch?.id) {
        await loadData(currentBranch.id)
      }
    } catch (error) {
      console.error('Error recording goods receipt:', error)
      alert('Failed to record goods receipt: ' + (error.message || 'Unknown error'))
    }
  }
 
 
  function getBranchStockEntries(itemId) {
    return branchStock.filter(entry => entry.item_id === itemId);
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

  if (roleLoading || loading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="panel px-10 py-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full border-2 border-accent/40 border-t-transparent animate-spin"></div>
          <p className="text-sm text-muted-foreground tracking-[0.3em] uppercase">Loading inventory</p>
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

  if (canViewInventory && !currentBranch) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center border border-blue-200">
          <div className="text-blue-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Select a Branch</h1>
          <p className="text-gray-600 mb-4">Inventory data is managed per branch. Please choose a branch from the top bar to continue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <motion.section {...panelMotion} className="panel px-6 py-7 space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Inventory Control</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-fluid-xl font-semibold text-foreground">Inventory Management</h1>
              {currentBranch && (
                <span className="metric-chip text-xs font-medium text-muted-foreground">
                  Branch | {currentBranch.name}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Track stock levels across locations, manage supplier relationships, and reconcile purchase orders with incoming goods.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowTransactionForm(true)}
              className={`${buttonClasses.secondary} ${disabledButtonClass}`}
            >
              + Quick Transaction
            </button>
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
              className={`${buttonClasses.primary} ${disabledButtonClass}`}
            >
              + Add Item
            </button>
          </div>
        </div>
      </motion.section>
      <motion.section {...panelMotion} className="panel px-6 py-6 space-y-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('items')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === 'items'
                ? 'bg-accent text-accent-foreground shadow-layer-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Items ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === 'transactions'
                ? 'bg-accent text-accent-foreground shadow-layer-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Transactions ({transactions.length})
          </button>
          <button
            onClick={() => setActiveTab('low-stock')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === 'low-stock'
                ? 'bg-warning text-warning-foreground shadow-layer-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Low Stock
            {lowStockItems.length > 0 && (
              <span className="ml-2 rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-danger-foreground">
                {lowStockItems.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === 'suppliers'
                ? 'bg-accent text-accent-foreground shadow-layer-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Suppliers ({suppliers.length})
          </button>
          <button
            onClick={() => setActiveTab('locations')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === 'locations'
                ? 'bg-accent text-accent-foreground shadow-layer-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Locations ({locations.length})
          </button>
          <button
            onClick={() => setActiveTab('purchase-orders')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === 'purchase-orders'
                ? 'bg-accent text-accent-foreground shadow-layer-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Purchase Orders ({purchaseOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('goods-receipts')}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === 'goods-receipts'
                ? 'bg-accent text-accent-foreground shadow-layer-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Goods Receipts ({goodsReceipts.length})
          </button>
        </div>
        <div className="pt-4 space-y-6">
                    {activeTab === 'items' && (
                      <div className="space-y-5">
                        <div className="flex flex-wrap gap-3">
                          <input
                            type="text"
                            placeholder="Search items, serials, descriptions…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`${baseInputClass} flex-1 min-w-[220px]`}
                          />
                          <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className={`${baseSelectClass} w-full sm:w-[180px]`}
                          >
                            <option value="all">All Categories</option>
                            <option value="battery_cell">Battery Cells</option>
                            <option value="component">Components</option>
                            <option value="accessory">Accessories</option>
                          </select>
                        </div>

                        <div className="rounded-2xl border border-white/40 bg-white/75 shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/40">
                              <thead className="bg-white/70">
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
                              <tbody className="bg-white/80 divide-y divide-white/60">
                                {filteredItems.map((item) => {
                                  const stockStatus = getStockStatus(item);
                                  const branchEntries = getBranchStockEntries(item.id);
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
                                      <td className="px-4 py-3 text-sm text-gray-500">
                                        {branchEntries.length > 0 ? (
                                          <div className="flex flex-wrap gap-1">
                                            {branchEntries.map((entry) => (
                                              <span
                                                key={`${entry.item_id}-${entry.location_id}`}
                                                className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-100"
                                              >
                                                {locations.find(loc => loc.id === entry.location_id)?.name || 'Location'}: {Number(entry.quantity || 0)}
                                              </span>
                                            ))}
                                          </div>
                                        ) : (
                                          <span>{item.location || '-'}</span>
                                        )}
                                      </td>
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
                          </div>
                          {filteredItems.length === 0 && (
                            <div className="py-8 text-center text-sm text-muted-foreground">No items found. {canEdit && 'Click "Add Item" to create one.'}</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Transactions Tab */}
                    {activeTab === 'transactions' && (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-white/40 bg-white/75 shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/40">
                              <thead className="bg-white/70">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white/80 divide-y divide-white/60">
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
                          </div>
                          {transactions.length === 0 && (
                            <div className="py-8 text-center text-sm text-muted-foreground">No transactions found.</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Low Stock Tab */}
                    {activeTab === 'low-stock' && (
                      <div className="space-y-4">
                        {lowStockItems.length > 0 ? (
                          <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                            <p>
                              <strong>Warning:</strong> {lowStockItems.length} item(s) are at or below minimum stock level.
                            </p>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                            <p>All items are above minimum stock level.</p>
                          </div>
                        )}
                        <div className="rounded-2xl border border-white/40 bg-white/75 shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/40">
                              <thead className="bg-white/70">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Code</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Min Level</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deficit</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white/80 divide-y divide-white/60">
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
                      </div>
                    )}

                    {/* Suppliers Tab */}
                    {activeTab === 'suppliers' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-semibold text-foreground">Supplier Directory</h2>
                            <p className="text-sm text-muted-foreground">Manage vendors feeding the supply chain.</p>
                          </div>
                          {canEdit && (
                            <button
                              onClick={() => setShowSupplierForm(true)}
                              className={`${buttonClasses.primary} ${disabledButtonClass}`}
                            >
                              + Add Supplier
                            </button>
                          )}
                        </div>
                        <div className="rounded-2xl border border-white/40 bg-white/75 shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/40">
                              <thead className="bg-white/70">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white/80 divide-y divide-white/60">
                                {suppliers.map((supplier) => (
                                  <tr key={supplier.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{supplier.name}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{supplier.contact_name || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">
                                      {supplier.phone || supplier.mobile || '-'}
                                      {supplier.mobile && supplier.phone && (
                                        <div className="text-xs text-gray-400">Alt: {supplier.mobile}</div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-blue-600">{supplier.email || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {supplier.gstin || supplier.pan ? (
                                        <div className="space-y-1">
                                          {supplier.gstin && <div className="text-xs font-mono">GSTIN: {supplier.gstin}</div>}
                                          {supplier.pan && <div className="text-xs font-mono">PAN: {supplier.pan}</div>}
                                          {supplier.msme_number && <div className="text-xs font-mono">MSME: {supplier.msme_number}</div>}
                                          {supplier.payment_terms && <div className="text-xs text-gray-400">Terms: {supplier.payment_terms}</div>}
                                          {supplier.credit_limit != null && <div className="text-xs text-gray-400">Credit Limit: ₹{supplier.credit_limit}</div>}
                                        </div>
                                      ) : (
                                        <span>-</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${supplier.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {supplier.status || 'active'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {suppliers.length === 0 && (
                            <div className="py-8 text-center text-sm text-muted-foreground">No suppliers yet. {canEdit && 'Add your first vendor to build purchasing workflows.'}</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Locations Tab */}
                    {activeTab === 'locations' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-semibold text-foreground">Stock Locations</h2>
                            <p className="text-sm text-muted-foreground">Warehouse and service bay storage for {currentBranch?.name || 'selected branch'}.</p>
                          </div>
                          {canEdit && (
                            <button
                              onClick={() => setShowLocationForm(true)}
                              className={`${buttonClasses.primary} ${disabledButtonClass}`}
                            >
                              + Add Location
                            </button>
                          )}
                        </div>
                        <div className="rounded-2xl border border-white/40 bg-white/75 shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/40">
                              <thead className="bg-white/70">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Default</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white/80 divide-y divide-white/60">
                                {locations.filter(loc => !currentBranch || loc.branch_id === currentBranch.id).map((location) => (
                                  <tr key={location.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{location.name}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{location.code || '-'}</td>
                                    <td className="px-4 py-3 text-sm">
                                      {location.is_default ? (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Default</span>
                                      ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{location.description || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {locations.filter(loc => !currentBranch || loc.branch_id === currentBranch.id).length === 0 && (
                            <div className="py-8 text-center text-sm text-muted-foreground">No locations configured for this branch.</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Purchase Orders Tab */}
                    {activeTab === 'purchase-orders' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-semibold text-foreground">Purchase Orders</h2>
                            <p className="text-sm text-muted-foreground">Track inbound supply for {currentBranch?.name || 'branch'}.</p>
                          </div>
                          {canEdit && (
                            <button
                              onClick={() => setShowPurchaseOrderForm(true)}
                              className={`${buttonClasses.primary} ${disabledButtonClass}`}
                            >
                              + New Purchase Order
                            </button>
                          )}
                        </div>
                        <div className="rounded-2xl border border-white/40 bg-white/75 shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/40">
                              <thead className="bg-white/70">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order #</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expected</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white/80 divide-y divide-white/60">
                                {purchaseOrders
                                  .filter(po => !currentBranch?.id || locations.find(loc => loc.id === po.location_id)?.branch_id === currentBranch.id)
                                  .map((po) => {
                                    const poLocation = locations.find(loc => loc.id === po.location_id);
                                    const poSupplier = suppliers.find(supplier => supplier.id === po.supplier_id);
                                    return (
                                      <tr key={po.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{po.order_number}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{poSupplier?.name || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{poLocation?.name || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '-'}</td>
                                        <td className="px-4 py-3 text-sm">
                                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${po.status === 'received' ? 'bg-green-100 text-green-700' : po.status === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {po.status}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{po.total_amount ? `₹${po.total_amount.toFixed(2)}` : '-'}</td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                          {purchaseOrders.length === 0 && (
                            <div className="py-8 text-center text-sm text-muted-foreground">No purchase orders yet.</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Goods Receipts Tab */}
                    {activeTab === 'goods-receipts' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h2 className="text-lg font-semibold text-foreground">Goods Receipts</h2>
                            <p className="text-sm text-muted-foreground">Record inbound stock and reconcile purchase orders.</p>
                          </div>
                          {canEdit && (
                            <button
                              onClick={() => setShowGoodsReceiptForm(true)}
                              className={`${buttonClasses.primary} ${disabledButtonClass}`}
                            >
                              + Record Receipt
                            </button>
                          )}
                        </div>
                        <div className="rounded-2xl border border-white/40 bg-white/75 shadow-sm">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/40">
                              <thead className="bg-white/70">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt #</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purchase Order</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received Date</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white/80 divide-y divide-white/60">
                                {goodsReceipts
                                  .filter(receipt => !currentBranch?.id || locations.find(loc => loc.id === receipt.location_id)?.branch_id === currentBranch.id)
                                  .map((receipt) => {
                                    const receiptLocation = locations.find(loc => loc.id === receipt.location_id);
                                    const receiptPO = purchaseOrders.find(po => po.id === receipt.purchase_order_id);
                                    return (
                                      <tr key={receipt.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{receipt.receipt_number}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{receiptPO?.order_number || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{receiptLocation?.name || '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{receipt.received_date ? new Date(receipt.received_date).toLocaleDateString() : '-'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{receipt.reference_number || '-'}</td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>
                          {goodsReceipts.length === 0 && (
                            <div className="py-8 text-center text-sm text-muted-foreground">No goods receipts recorded yet.</div>
                          )}
                        </div>
                      </div>
                    )}

            </div>
      </motion.section>
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
                            className={baseInputClass}
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
                            className={baseInputClass}
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
                            className={baseInputClass}
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
                          <option value="transfer">Transfer</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                        <select
                          name="location_id"
                          value={transactionForm.location_id}
                          onChange={handleTransactionFormChange}
                          required
                          className="w-full p-2 border border-gray-300 rounded-md"
                        >
                          <option value="">Select a location</option>
                          {locations.filter(loc => !currentBranch || loc.branch_id === currentBranch.id).map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                          ))}
                        </select>
                      </div>
                      {transactionForm.transaction_type === 'transfer' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Target Location *</label>
                          <select
                            name="target_location_id"
                            value={transactionForm.target_location_id}
                            onChange={handleTransactionFormChange}
                            required
                            className="w-full p-2 border border-gray-300 rounded-md"
                          >
                            <option value="">Select destination location</option>
                            {locations
                              .filter(loc => !currentBranch || loc.branch_id === currentBranch.id)
                              .map(loc => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                              ))}
                          </select>
                        </div>
                      )}
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

              {/* Supplier Form Modal */}
              {showSupplierForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Add New Supplier</h2>
                    <form onSubmit={handleSupplierSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <input
                          type="text"
                          name="name"
                          value={supplierForm.name}
                          onChange={handleSupplierFormChange}
                          required
                          className={baseInputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                        <input
                          type="text"
                          name="code"
                          value={supplierForm.code}
                          onChange={handleSupplierFormChange}
                          className={baseInputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                        <input
                          type="text"
                          name="contact_name"
                          value={supplierForm.contact_name}
                          onChange={handleSupplierFormChange}
                          className={baseInputClass}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                          <input
                            type="tel"
                            name="phone"
                            value={supplierForm.phone}
                            onChange={handleSupplierFormChange}
                            className={baseInputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Mobile</label>
                          <input
                            type="tel"
                            name="mobile"
                            value={supplierForm.mobile}
                            onChange={handleSupplierFormChange}
                            className={baseInputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          name="email"
                          value={supplierForm.email}
                          onChange={handleSupplierFormChange}
                          className={baseInputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tax Number</label>
                        <input
                          type="text"
                          name="tax_number"
                          value={supplierForm.tax_number}
                          onChange={handleSupplierFormChange}
                          className={baseInputClass}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                          <input
                            type="text"
                            name="gstin"
                            value={supplierForm.gstin}
                            onChange={handleSupplierFormChange}
                            className={baseInputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">PAN</label>
                          <input
                            type="text"
                            name="pan"
                            value={supplierForm.pan}
                            onChange={handleSupplierFormChange}
                            className={baseInputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">MSME Number</label>
                        <input
                          type="text"
                          name="msme_number"
                          value={supplierForm.msme_number}
                          onChange={handleSupplierFormChange}
                          className={baseInputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                        <textarea
                          name="address"
                          value={supplierForm.address}
                          onChange={handleSupplierFormChange}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          rows="2"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                          <input
                            type="text"
                            name="city"
                            value={supplierForm.city}
                            onChange={handleSupplierFormChange}
                            className={baseInputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                          <input
                            type="text"
                            name="state"
                            value={supplierForm.state}
                            onChange={handleSupplierFormChange}
                            className={baseInputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                          <input
                            type="text"
                            name="postal_code"
                            value={supplierForm.postal_code}
                            onChange={handleSupplierFormChange}
                            className={baseInputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                        <input
                          type="text"
                          name="country"
                          value={supplierForm.country}
                          onChange={handleSupplierFormChange}
                          className={baseInputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                          name="notes"
                          value={supplierForm.notes}
                          onChange={handleSupplierFormChange}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          rows="2"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setShowSupplierForm(false)}
                          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                        >
                          Create Supplier
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Location Form Modal */}
              {showLocationForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">Add New Location</h2>
                    <form onSubmit={handleLocationSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <input
                          type="text"
                          name="name"
                          value={locationForm.name}
                          onChange={handleLocationFormChange}
                          required
                          className={baseInputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                        <input
                          type="text"
                          name="code"
                          value={locationForm.code}
                          onChange={handleLocationFormChange}
                          className={baseInputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea
                          name="description"
                          value={locationForm.description}
                          onChange={handleLocationFormChange}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          rows="2"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Is Default</label>
                        <input
                          type="checkbox"
                          name="is_default"
                          checked={locationForm.is_default}
                          onChange={handleLocationFormChange}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => setShowLocationForm(false)}
                          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                        >
                          Create Location
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Purchase Order Form Modal */}
              {showPurchaseOrderForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">New Purchase Order</h2>
                    <form onSubmit={handlePurchaseOrderSubmit} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
                          <select
                            name="supplier_id"
                            value={purchaseOrderForm.supplier_id}
                            onChange={handlePurchaseOrderFormChange}
                            required
                            className="w-full p-2 border border-gray-300 rounded-md"
                          >
                            <option value="">Select a supplier</option>
                            {suppliers.map(supplier => (
                              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                          <select
                            name="location_id"
                            value={purchaseOrderForm.location_id}
                            onChange={handlePurchaseOrderFormChange}
                            required
                            className="w-full p-2 border border-gray-300 rounded-md"
                          >
                            <option value="">Select a location</option>
                            {locations.filter(loc => !currentBranch || loc.branch_id === currentBranch.id).map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Expected Date *</label>
                        <input
                          type="date"
                          name="expected_date"
                          value={purchaseOrderForm.expected_date}
                          onChange={handlePurchaseOrderFormChange}
                          required
                          className="w-full p-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                        <input
                          type="text"
                          name="reference_number"
                          value={purchaseOrderForm.reference_number}
                          onChange={handlePurchaseOrderFormChange}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                          name="notes"
                          value={purchaseOrderForm.notes}
                          onChange={handlePurchaseOrderFormChange}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          rows="2"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Items</label>
                          {purchaseOrderItems.map((item, index) => (
                            <div key={index} className="flex items-center gap-2 mb-2">
                              <select
                                name={`item_id_${index}`}
                                value={item.item_id}
                                onChange={(e) => updatePurchaseOrderItem(index, 'item_id', e.target.value)}
                                className="flex-1 p-2 border border-gray-300 rounded-md"
                              >
                                <option value="">Select an item</option>
                                {items.filter(i => i.status === 'active').map(i => (
                                  <option key={i.id} value={i.id}>{i.item_code} - {i.item_name}</option>
                                ))}
                              </select>
                              <input
                                type="number"
                                name={`quantity_${index}`}
                                value={item.quantity}
                                onChange={(e) => updatePurchaseOrderItem(index, 'quantity', e.target.value)}
                                min="0"
                                className="w-24 p-2 border border-gray-300 rounded-md text-right"
                              />
                              <input
                                type="number"
                                name={`unit_price_${index}`}
                                value={item.unit_price}
                                onChange={(e) => updatePurchaseOrderItem(index, 'unit_price', e.target.value)}
                                step="0.01"
                                className="w-24 p-2 border border-gray-300 rounded-md text-right"
                              />
                              <button
                                type="button"
                                onClick={() => removePurchaseOrderItemRow(index)}
                                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-medium transition-colors"
                                title="Remove item"
                              >
                                ✖
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={addPurchaseOrderItemRow}
                            className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium transition-colors"
                          >
                            + Add Item
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setShowPurchaseOrderForm(false)
                            setPurchaseOrderForm({
                              supplier_id: '',
                              location_id: purchaseOrderForm.location_id,
                              expected_date: today,
                              reference_number: '',
                              notes: ''
                            })
                            setPurchaseOrderItems([{ item_id: '', quantity: '', unit_price: '' }])
                          }}
                          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                        >
                          Create Purchase Order
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Goods Receipt Form Modal */}
              {showGoodsReceiptForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4">New Goods Receipt</h2>
                    <form onSubmit={handleGoodsReceiptSubmit} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Order *</label>
                        <select
                          name="purchase_order_id"
                          value={goodsReceiptForm.purchase_order_id}
                          onChange={(e) => handleGoodsReceiptPurchaseOrderChange(e.target.value)}
                          required
                          className="w-full p-2 border border-gray-300 rounded-md"
                        >
                          <option value="">Select a purchase order</option>
                          {purchaseOrders.map(po => (
                            <option key={po.id} value={po.id}>{po.order_number} - {po.inventory_suppliers?.name || 'Unknown Supplier'}</option>
                          ))}
                        </select>
                      </div>
                      {selectedPurchaseOrder && (
                        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-700">
                          <div><strong>Supplier:</strong> {selectedPurchaseOrder.inventory_suppliers?.name || 'N/A'}</div>
                          <div><strong>Status:</strong> {selectedPurchaseOrder.status}</div>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                        <select
                          name="location_id"
                          value={goodsReceiptForm.location_id}
                          onChange={handleGoodsReceiptFormChange}
                          required
                          className="w-full p-2 border border-gray-300 rounded-md"
                        >
                          <option value="">Select a receiving location</option>
                          {locations.filter(loc => !currentBranch || loc.branch_id === currentBranch.id).map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Received Date *</label>
                        <input
                          type="date"
                          name="received_date"
                          value={goodsReceiptForm.received_date}
                          onChange={handleGoodsReceiptFormChange}
                          required
                          className="w-full p-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reference Number</label>
                        <input
                          type="text"
                          name="reference_number"
                          value={goodsReceiptForm.reference_number}
                          onChange={handleGoodsReceiptFormChange}
                          className="w-full p-2 border border-gray-300 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                          name="notes"
                          value={goodsReceiptForm.notes}
                          onChange={handleGoodsReceiptFormChange}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          rows="2"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Items</label>
                          {goodsReceiptItems.map((item, index) => (
                            <div key={index} className="mb-3">
                              <div className="flex items-center gap-2">
                                <select
                                  name={`item_id_${index}`}
                                  value={item.item_id}
                                  onChange={(e) => updateGoodsReceiptItem(index, 'item_id', e.target.value)}
                                  className="flex-1 p-2 border border-gray-300 rounded-md"
                                >
                                  <option value="">Select an item</option>
                                  {items.filter(i => i.status === 'active').map(i => (
                                    <option key={i.id} value={i.id}>{i.item_code} - {i.item_name}</option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  name={`quantity_${index}`}
                                  value={item.quantity}
                                  onChange={(e) => updateGoodsReceiptItem(index, 'quantity', e.target.value)}
                                  min="0"
                                  className="w-24 p-2 border border-gray-300 rounded-md text-right"
                                />
                                <input
                                  type="number"
                                  name={`unit_price_${index}`}
                                  value={item.unit_price}
                                  onChange={(e) => updateGoodsReceiptItem(index, 'unit_price', e.target.value)}
                                  step="0.01"
                                  className="w-24 p-2 border border-gray-300 rounded-md text-right"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeGoodsReceiptItemRow(index)}
                                  className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-xs font-medium transition-colors"
                                  title="Remove item"
                                >
                                  ✖
                                </button>
                              </div>
                              {item.ordered_quantity !== undefined && (
                                <div className="mt-1 text-xs text-gray-500">
                                  Ordered: {item.ordered_quantity} • Received: {item.received_quantity || 0} • Remaining: {Math.max(0, (item.ordered_quantity || 0) - (item.received_quantity || 0))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={addGoodsReceiptItemRow}
                            className="px-4 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-sm font-medium transition-colors"
                          >
                            + Add Item
                          </button>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setShowGoodsReceiptForm(false)
                            setSelectedPurchaseOrder(null)
                            setGoodsReceiptForm({
                              purchase_order_id: '',
                              location_id: goodsReceiptForm.location_id,
                              received_date: today,
                              reference_number: '',
                              notes: ''
                            })
                            setGoodsReceiptItems([{ item_id: '', quantity: '', unit_price: '', purchase_order_item_id: null }])
                          }}
                          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                        >
                          Create Goods Receipt
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
    </div>
  );
}
