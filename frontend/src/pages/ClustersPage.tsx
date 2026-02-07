import React from 'react';
import { RectangleStackIcon } from '@heroicons/react/24/outline';

const ClustersPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center py-12">
        <div className="mx-auto h-12 w-12 text-gray-400">
          <RectangleStackIcon className="h-12 w-12" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          Conversation Clusters
        </h3>
        <p className="mt-2 text-gray-500 max-w-sm mx-auto">
          Automatic clustering and manual organization of related conversations will be available here.
        </p>
        <div className="mt-6">
          <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg">
            <strong>Coming soon:</strong> View and manage conversation clusters, auto-generate clusters based on similarity, and visualize conversation relationships.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClustersPage;