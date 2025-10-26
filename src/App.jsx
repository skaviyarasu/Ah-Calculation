import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

function App() {
  const [numCells, setNumCells] = useState(13);
  const [targetVoltage, setTargetVoltage] = useState(52.0);
  const [cells, setCells] = useState([]);
  const [results, setResults] = useState(null);

  // Initialize cells when numCells changes
  useEffect(() => {
    const newCells = Array(numCells).fill().map((_, index) => ({
      id: index + 1,
      voltage: 4.0,
      capacity: 100,
      internalResistance: 0.01
    }));
    setCells(newCells);
  }, [numCells]);

  // Calculate balancing results
  useEffect(() => {
    if (cells.length > 0) {
      const totalVoltage = cells.reduce((sum, cell) => sum + cell.voltage, 0);
      const avgVoltage = totalVoltage / cells.length;
      const totalCapacity = cells.reduce((sum, cell) => sum + cell.capacity, 0);
      const avgCapacity = totalCapacity / cells.length;
      
      const voltageDeviation = Math.max(...cells.map(cell => Math.abs(cell.voltage - avgVoltage)));
      const capacityDeviation = Math.max(...cells.map(cell => Math.abs(cell.capacity - avgCapacity)));
      
      setResults({
        totalVoltage: totalVoltage.toFixed(2),
        avgVoltage: avgVoltage.toFixed(3),
        totalCapacity: totalCapacity.toFixed(1),
        avgCapacity: avgCapacity.toFixed(1),
        voltageDeviation: voltageDeviation.toFixed(3),
        capacityDeviation: capacityDeviation.toFixed(1),
        isBalanced: voltageDeviation < 0.05 && capacityDeviation < 5
      });
    }
  }, [cells]);

  const handleCellChange = (cellId, field, value) => {
    const newCells = cells.map(cell => 
      cell.id === cellId 
        ? { ...cell, [field]: parseFloat(value) || 0 }
        : cell
    );
    setCells(newCells);
  };

  const handleNumCellsChange = (value) => {
    const newNum = Math.max(1, Math.min(20, parseInt(value) || 1));
    setNumCells(newNum);
  };

  const autoBalance = () => {
    if (cells.length === 0) return;
    
    const avgVoltage = cells.reduce((sum, cell) => sum + cell.voltage, 0) / cells.length;
    const avgCapacity = cells.reduce((sum, cell) => sum + cell.capacity, 0) / cells.length;
    
    const balancedCells = cells.map(cell => ({
      ...cell,
      voltage: avgVoltage + (Math.random() - 0.5) * 0.02, // Small random variation
      capacity: avgCapacity + (Math.random() - 0.5) * 2    // Small random variation
    }));
    
    setCells(balancedCells);
  };

  const resetCells = () => {
    const newCells = Array(numCells).fill().map((_, index) => ({
      id: index + 1,
      voltage: 4.0 + (Math.random() - 0.5) * 0.2, // Random voltage between 3.9-4.1V
      capacity: 100 + (Math.random() - 0.5) * 20,  // Random capacity between 90-110Ah
      internalResistance: 0.01 + Math.random() * 0.02 // Random IR between 0.01-0.03Ω
    }));
    setCells(newCells);
  };

  const exportData = () => {
    const csvHeader = "Cell ID,Voltage (V),Capacity (Ah),Internal Resistance (Ω)\n";
    const csvData = cells.map(cell => 
      `${cell.id},${cell.voltage},${cell.capacity},${cell.internalResistance}`
    ).join('\n');
    
    const csv = csvHeader + csvData;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ah_balancer_data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg shadow-lg p-6"
        >
          <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">
            AH Balancer - 13SxP Battery Optimizer
          </h1>
          
          {/* Configuration Panel */}
          <div className="mb-6 bg-blue-50 p-4 rounded-lg">
            <h2 className="text-xl font-semibold text-blue-800 mb-4">Battery Configuration</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Cells:
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={numCells}
                  onChange={(e) => handleNumCellsChange(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Voltage (V):
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={targetVoltage}
                  onChange={(e) => setTargetVoltage(parseFloat(e.target.value) || 0)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={autoBalance}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                Auto Balance
              </button>
              <button
                onClick={resetCells}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                Reset Cells
              </button>
              <button
                onClick={exportData}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                Export Data
              </button>
            </div>
          </div>

          {/* Results Panel */}
          {results && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4"
            >
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800">Total Voltage</h3>
                <p className="text-2xl font-bold text-green-600">{results.totalVoltage}V</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-800">Total Capacity</h3>
                <p className="text-2xl font-bold text-blue-600">{results.totalCapacity}Ah</p>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-800">Voltage Deviation</h3>
                <p className="text-2xl font-bold text-yellow-600">{results.voltageDeviation}V</p>
              </div>
              <div className={`p-4 rounded-lg ${results.isBalanced ? 'bg-green-50' : 'bg-red-50'}`}>
                <h3 className={`font-semibold ${results.isBalanced ? 'text-green-800' : 'text-red-800'}`}>
                  Balance Status
                </h3>
                <p className={`text-lg font-bold ${results.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                  {results.isBalanced ? 'Balanced' : 'Needs Balancing'}
                </p>
              </div>
            </motion.div>
          )}

          {/* Cells Table */}
          {cells.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="overflow-x-auto"
            >
              <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cell ID
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Voltage (V)
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Capacity (Ah)
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Internal Resistance (Ω)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {cells.map((cell) => (
                    <tr key={cell.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        Cell {cell.id}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.001"
                          value={cell.voltage}
                          onChange={(e) => handleCellChange(cell.id, 'voltage', e.target.value)}
                          className="w-full p-2 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.1"
                          value={cell.capacity}
                          onChange={(e) => handleCellChange(cell.id, 'capacity', e.target.value)}
                          className="w-full p-2 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          step="0.001"
                          value={cell.internalResistance}
                          onChange={(e) => handleCellChange(cell.id, 'internalResistance', e.target.value)}
                          className="w-full p-2 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default App;
