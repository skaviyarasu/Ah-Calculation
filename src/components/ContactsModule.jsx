import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { accounting, auth } from '../lib/supabase';
import { useRole } from '../hooks/useRole';

export default function ContactsModule() {
  const [activeTab, setActiveTab] = useState('customers'); // 'customers' or 'vendors'
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null);

  const { canViewInventory } = useRole();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const user = await auth.getCurrentUser();
    setIsAuthenticated(!!user);
  }

  const [contactForm, setContactForm] = useState({
    contact_type: 'customer',
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    mobile: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'India',
    gstin: '',
    pan: '',
    credit_limit: 0,
    payment_terms: '',
    opening_balance: 0,
    notes: '',
    status: 'active'
  });

  useEffect(() => {
    if (canViewInventory) {
      loadData();
    }
  }, [canViewInventory, activeTab]);

  async function loadData() {
    setLoading(true);
    try {
      const contactsData = await accounting.getAllContacts({
        contact_type: activeTab === 'customers' ? 'customer' : 'vendor',
        status: 'active'
      });
      setContacts(contactsData || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
      alert('Failed to load contacts: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleContactFormChange(e) {
    const { name, value } = e.target;
    setContactForm(prev => ({
      ...prev,
      [name]: name === 'credit_limit' || name === 'opening_balance' 
        ? parseFloat(value) || 0 
        : value
    }));
  }

  async function handleSubmitContact(e) {
    e.preventDefault();
    try {
      if (editingContact) {
        await accounting.updateContact(editingContact.id, contactForm);
      } else {
        await accounting.createContact({
          ...contactForm,
          contact_type: activeTab === 'customers' ? 'customer' : 'vendor'
        });
      }
      await loadData();
      setShowContactForm(false);
      setEditingContact(null);
      setContactForm({
        contact_type: activeTab === 'customers' ? 'customer' : 'vendor',
        company_name: '',
        contact_name: '',
        email: '',
        phone: '',
        mobile: '',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: 'India',
        gstin: '',
        pan: '',
        credit_limit: 0,
        payment_terms: '',
        opening_balance: 0,
        notes: '',
        status: 'active'
      });
    } catch (error) {
      console.error('Error saving contact:', error);
      alert('Failed to save contact: ' + error.message);
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
          <p className="text-gray-600">Loading contacts...</p>
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
              <h2 className="text-2xl font-bold text-gray-900">Contacts</h2>
              {canManageInventory && (
                <button
                  onClick={() => {
                    setEditingContact(null);
                    setContactForm({
                      contact_type: activeTab === 'customers' ? 'customer' : 'vendor',
                      company_name: '',
                      contact_name: '',
                      email: '',
                      phone: '',
                      mobile: '',
                      address_line1: '',
                      address_line2: '',
                      city: '',
                      state: '',
                      postal_code: '',
                      country: 'India',
                      gstin: '',
                      pan: '',
                      credit_limit: 0,
                      payment_terms: '',
                      opening_balance: 0,
                      notes: '',
                      status: 'active'
                    });
                    setShowContactForm(true);
                  }}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium shadow-md"
                >
                  + Add {activeTab === 'customers' ? 'Customer' : 'Vendor'}
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b">
              <button
                onClick={() => setActiveTab('customers')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'customers'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Customers ({contacts.filter(c => c.contact_type === 'customer').length})
              </button>
              <button
                onClick={() => setActiveTab('vendors')}
                className={`px-4 py-2 font-medium transition-colors ${
                  activeTab === 'vendors'
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Vendors ({contacts.filter(c => c.contact_type === 'vendor').length})
              </button>
            </div>
          </div>

          {/* Contacts Table */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {activeTab === 'customers' ? 'Customers' : 'Vendors'}
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GSTIN</th>
                    {activeTab === 'customers' && (
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit Limit</th>
                    )}
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {contacts.length === 0 ? (
                    <tr>
                      <td colSpan={activeTab === 'customers' ? 8 : 7} className="px-4 py-8 text-center text-gray-500">
                        No {activeTab} found. Click "Add {activeTab === 'customers' ? 'Customer' : 'Vendor'}" to get started.
                      </td>
                    </tr>
                  ) : (
                    contacts.map((contact) => (
                      <tr key={contact.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                          {contact.contact_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {contact.company_name || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {contact.email || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {contact.phone || contact.mobile || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 font-mono">
                          {contact.gstin || '-'}
                        </td>
                        {activeTab === 'customers' && (
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                            {formatCurrency(contact.credit_limit)}
                          </td>
                        )}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                          <span className={contact.current_balance >= 0 ? 'text-blue-600' : 'text-red-600'}>
                            {formatCurrency(contact.current_balance)}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {canManageInventory && (
                            <button
                              onClick={() => {
                                setEditingContact(contact);
                                setContactForm({
                                  contact_type: contact.contact_type,
                                  company_name: contact.company_name || '',
                                  contact_name: contact.contact_name || '',
                                  email: contact.email || '',
                                  phone: contact.phone || '',
                                  mobile: contact.mobile || '',
                                  address_line1: contact.address_line1 || '',
                                  address_line2: contact.address_line2 || '',
                                  city: contact.city || '',
                                  state: contact.state || '',
                                  postal_code: contact.postal_code || '',
                                  country: contact.country || 'India',
                                  gstin: contact.gstin || '',
                                  pan: contact.pan || '',
                                  credit_limit: contact.credit_limit || 0,
                                  payment_terms: contact.payment_terms || '',
                                  opening_balance: contact.opening_balance || 0,
                                  notes: contact.notes || '',
                                  status: contact.status || 'active'
                                });
                                setShowContactForm(true);
                              }}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Edit
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

          {/* Contact Form Modal */}
          {showContactForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-gray-800">
                    {editingContact ? 'Edit' : 'Add'} {activeTab === 'customers' ? 'Customer' : 'Vendor'}
                  </h2>
                  <button
                    onClick={() => setShowContactForm(false)}
                    className="text-gray-500 hover:text-gray-700 text-2xl"
                  >
                    ×
                  </button>
                </div>
                <form onSubmit={handleSubmitContact} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
                      <input
                        type="text"
                        name="contact_name"
                        value={contactForm.contact_name}
                        onChange={handleContactFormChange}
                        required
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                      <input
                        type="text"
                        name="company_name"
                        value={contactForm.company_name}
                        onChange={handleContactFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        name="email"
                        value={contactForm.email}
                        onChange={handleContactFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        type="tel"
                        name="phone"
                        value={contactForm.phone}
                        onChange={handleContactFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label>
                      <input
                        type="text"
                        name="gstin"
                        value={contactForm.gstin}
                        onChange={handleContactFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="15-digit GSTIN"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">PAN</label>
                      <input
                        type="text"
                        name="pan"
                        value={contactForm.pan}
                        onChange={handleContactFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="10-character PAN"
                      />
                    </div>
                  </div>
                  {activeTab === 'customers' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Credit Limit</label>
                        <input
                          type="number"
                          name="credit_limit"
                          value={contactForm.credit_limit}
                          onChange={handleContactFormChange}
                          min="0"
                          step="0.01"
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                        <input
                          type="text"
                          name="payment_terms"
                          value={contactForm.payment_terms}
                          onChange={handleContactFormChange}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., Net 30"
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input
                      type="text"
                      name="address_line1"
                      value={contactForm.address_line1}
                      onChange={handleContactFormChange}
                      placeholder="Address Line 1"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 mb-2"
                    />
                    <input
                      type="text"
                      name="address_line2"
                      value={contactForm.address_line2}
                      onChange={handleContactFormChange}
                      placeholder="Address Line 2"
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                      <input
                        type="text"
                        name="city"
                        value={contactForm.city}
                        onChange={handleContactFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <input
                        type="text"
                        name="state"
                        value={contactForm.state}
                        onChange={handleContactFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                      <input
                        type="text"
                        name="postal_code"
                        value={contactForm.postal_code}
                        onChange={handleContactFormChange}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                      name="notes"
                      value={contactForm.notes}
                      onChange={handleContactFormChange}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                      rows="3"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowContactForm(false)}
                      className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                    >
                      {editingContact ? 'Update' : 'Create'} {activeTab === 'customers' ? 'Customer' : 'Vendor'}
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

