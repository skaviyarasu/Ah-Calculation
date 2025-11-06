import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { accounting, inventory } from '../lib/supabase';
import { useRole } from '../hooks/useRole';

export default function PurchasesModule() {
  const [activeTab, setActiveTab] = useState('bills'); // 'pos' or 'bills'
  const [bills, setBills] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBillForm, setShowBillForm] = useState(false);
  const [showPOForm, setShowPOForm] = useState(false);

  const { canViewInventory, canManageInventory } = useRole();

  const [billForm, setBillForm] = useState({
    vendor_id: '',
    bill_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
    terms_and_conditions: ''
  });

  const [billItems, setBillItems] = useState([]);

  useEffect(() => {
    if (canViewInventory) {
      loadData();
    }
  }, [canViewInventory, activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      const [billsData, vendorsData, itemsData] = await Promise.all([
        accounting.getAllBills(),
        accounting.getAllContacts({ contact_type: 'vendor', status: 'active' }),
        inventory.getAllItems()
      ]);

      setBills(billsData || []);
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
              {canManageInventory && (
                <button
                  onClick={() => setShowBillForm(true)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium shadow-md"
                >
                  + Create Bill
                </button>
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
              <p className="text-gray-600">Purchase Orders feature coming soon...</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

