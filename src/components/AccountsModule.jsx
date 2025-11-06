import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { accounting } from '../lib/supabase';
import { useRole } from '../hooks/useRole';

export default function AccountsModule() {
  const [activeTab, setActiveTab] = useState('receivable'); // 'receivable' or 'payable'
  const [accountsReceivable, setAccountsReceivable] = useState([]);
  const [accountsPayable, setAccountsPayable] = useState([]);
  const [loading, setLoading] = useState(true);

  const { canViewInventory } = useRole();

  useEffect(() => {
    if (canViewInventory) {
      loadData();
    }
  }, [canViewInventory, activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      if (activeTab === 'receivable') {
        const arData = await accounting.getAccountsReceivable();
        setAccountsReceivable(arData || []);
      } else {
        const apData = await accounting.getAccountsPayable();
        setAccountsPayable(apData || []);
      }
    } catch (error) {
      console.error('Error loading accounts data:', error);
      alert('Failed to load accounts data: ' + error.message);
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
          <p className="text-gray-600">Loading accounts...</p>
        </div>
      </div>
    );
  }

  const totalAR = accountsReceivable.reduce((sum, ar) => sum + (ar.outstanding_amount || 0), 0);
  const totalOverdueAR = accountsReceivable.reduce((sum, ar) => sum + (ar.overdue_amount || 0), 0);
  const totalAP = accountsPayable.reduce((sum, ap) => sum + (ap.outstanding_amount || 0), 0);
  const totalOverdueAP = accountsPayable.reduce((sum, ap) => sum + (ap.overdue_amount || 0), 0);

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
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Accounts Receivable & Payable</h2>
            
            {/* Tabs */}
            <div className="flex gap-2 border-b">
              <button
                onClick={() => setActiveTab('receivable')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'receivable'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Accounts Receivable
              </button>
              <button
                onClick={() => setActiveTab('payable')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'payable'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Accounts Payable
              </button>
            </div>
          </div>

          {/* Accounts Receivable */}
          {activeTab === 'receivable' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Total Outstanding</h3>
                  <p className="text-3xl font-bold text-blue-600">{formatCurrency(totalAR)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Overdue Amount</h3>
                  <p className="text-3xl font-bold text-red-600">{formatCurrency(totalOverdueAR)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Active Customers</h3>
                  <p className="text-3xl font-bold text-green-600">{accountsReceivable.length}</p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Accounts Receivable</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Invoiced</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Paid</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Outstanding</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Overdue</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invoices</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {accountsReceivable.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                            No outstanding receivables.
                          </td>
                        </tr>
                      ) : (
                        accountsReceivable.map((ar) => (
                          <tr key={ar.customer_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {ar.customer_name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                              {formatCurrency(ar.total_invoiced)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600">
                              {formatCurrency(ar.total_paid)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-blue-600 font-medium">
                              {formatCurrency(ar.outstanding_amount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600 font-medium">
                              {formatCurrency(ar.overdue_amount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                              {ar.invoice_count}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Accounts Payable */}
          {activeTab === 'payable' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Total Outstanding</h3>
                  <p className="text-3xl font-bold text-blue-600">{formatCurrency(totalAP)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-red-500">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Overdue Amount</h3>
                  <p className="text-3xl font-bold text-red-600">{formatCurrency(totalOverdueAP)}</p>
                </div>
                <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
                  <h3 className="text-sm font-medium text-gray-600 mb-2">Active Vendors</h3>
                  <p className="text-3xl font-bold text-green-600">{accountsPayable.length}</p>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Accounts Payable</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Billed</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Paid</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Outstanding</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Overdue</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Bills</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {accountsPayable.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                            No outstanding payables.
                          </td>
                        </tr>
                      ) : (
                        accountsPayable.map((ap) => (
                          <tr key={ap.vendor_id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {ap.vendor_name}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                              {formatCurrency(ap.total_billed)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600">
                              {formatCurrency(ap.total_paid)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-blue-600 font-medium">
                              {formatCurrency(ap.outstanding_amount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600 font-medium">
                              {formatCurrency(ap.overdue_amount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                              {ap.bill_count}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

