import React, { useState } from 'react';
import { motion } from 'framer-motion';
import InvoicingModule from './InvoicingModule';
import PurchasesModule from './PurchasesModule';
import AccountsModule from './AccountsModule';
import ContactsModule from './ContactsModule';
import SalesManagement from './SalesManagement';
import PLDashboard from './PLDashboard';

export default function AccountingDashboard() {
  const [activeTab, setActiveTab] = useState('sales');

  const tabs = [
    { id: 'sales', label: 'Sales', icon: '💰', component: SalesManagement },
    { id: 'invoicing', label: 'Invoicing', icon: '📄', component: InvoicingModule },
    { id: 'purchases', label: 'Purchases', icon: '🛒', component: PurchasesModule },
    { id: 'contacts', label: 'Contacts', icon: '👥', component: ContactsModule },
    { id: 'accounts', label: 'Accounts', icon: '📊', component: AccountsModule },
    { id: 'reports', label: 'P&L Reports', icon: '📈', component: PLDashboard }
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || SalesManagement;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-4">
            <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-7xl mx-auto"
      >
        <ActiveComponent />
      </motion.div>
    </div>
  );
}

