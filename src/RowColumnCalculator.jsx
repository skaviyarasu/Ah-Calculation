import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

function RowColumnCalculator() {
  const [numRows, setNumRows] = useState(3);
  const [numCols, setNumCols] = useState(3);
  const [grid, setGrid] = useState([]);
  const [rowSums, setRowSums] = useState([]);

  // Initialize grid when rows/columns change
  useEffect(() => {
    const newGrid = Array(numRows).fill().map(() => 
      Array(numCols).fill().map(() => ({ value: 0 }))
    );
    setGrid(newGrid);
  }, [numRows, numCols]);

  // Calculate row sums whenever grid changes
  useEffect(() => {
    const sums = grid.map(row => 
      row.reduce((sum, cell) => sum + (parseFloat(cell.value) || 0), 0)
    );
    setRowSums(sums);
  }, [grid]);

  const handleCellChange = (rowIndex, colIndex, value) => {
    const newGrid = [...grid];
    newGrid[rowIndex][colIndex] = { value: parseFloat(value) || 0 };
    setGrid(newGrid);
  };

  const handleRowsChange = (value) => {
    const newRows = Math.max(1, parseInt(value) || 1);
    setNumRows(newRows);
  };

  const handleColsChange = (value) => {
    const newCols = Math.max(1, parseInt(value) || 1);
    setNumCols(newCols);
  };

  const clearGrid = () => {
    const newGrid = Array(numRows).fill().map(() => 
      Array(numCols).fill().map(() => ({ value: 0 }))
    );
    setGrid(newGrid);
  };

  const exportToCSV = () => {
    const csvData = grid.map((row, rowIndex) => {
      const rowData = row.map(cell => cell.value);
      rowData.push(rowSums[rowIndex]); // Add row sum as final column
      return rowData.join(',');
    });
    
    const csv = csvData.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'row_column_calculation.csv';
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
            Row & Column Calculator
          </h1>
          
          {/* Input Parameters */}
          <div className="mb-6 bg-blue-50 p-4 rounded-lg">
            <h2 className="text-xl font-semibold text-blue-800 mb-4">Grid Parameters</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Rows:
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={numRows}
                  onChange={(e) => handleRowsChange(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Columns:
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={numCols}
                  onChange={(e) => handleColsChange(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={clearGrid}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                Clear Grid
              </button>
              <button
                onClick={exportToCSV}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors"
              >
                Export CSV
              </button>
            </div>
          </div>

          {/* Grid Display */}
          {grid.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="overflow-x-auto"
            >
              <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r">
                      Row
                    </th>
                    {Array.from({ length: numCols }, (_, colIndex) => (
                      <th key={colIndex} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r">
                        Col {colIndex + 1}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-50">
                      Row Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {grid.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 border-r">
                        Row {rowIndex + 1}
                      </td>
                      {row.map((cell, colIndex) => (
                        <td key={colIndex} className="px-2 py-1 border-r">
                          <input
                            type="number"
                            value={cell.value}
                            onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                            className="w-full p-2 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="0"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm font-bold text-green-600 text-center bg-green-50">
                        {rowSums[rowIndex]?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}

          {/* Summary Statistics */}
          {grid.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4"
            >
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-800">Total Rows</h3>
                <p className="text-2xl font-bold text-blue-600">{numRows}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-800">Total Columns</h3>
                <p className="text-2xl font-bold text-green-600">{numCols}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-800">Grand Total</h3>
                <p className="text-2xl font-bold text-purple-600">
                  {rowSums.reduce((sum, rowSum) => sum + rowSum, 0).toFixed(2)}
                </p>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

export default RowColumnCalculator;

