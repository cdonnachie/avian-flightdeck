'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Check,
  X,
  Search,
  User,
  Clock,
  Coins,
  QrCode,
  Camera,
  Share2,
} from 'lucide-react';
import { StorageService } from '@/services/core/StorageService';
import { SavedAddress, DEFAULT_CATEGORIES, QRScanResult } from '@/types/addressBook';
import { toast } from 'sonner';
import QRScannerModal from './QRScannerModal';
import QRDisplayModal from './QRDisplayModal';
import ContactAvatar from './ContactAvatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface AddressBookProps {
  onSelectAddress: (address: string) => void;
  currentAddress?: string;
}

export default function AddressBook({ onSelectAddress, currentAddress }: AddressBookProps) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'recent' | 'name' | 'usage' | 'tag'>('recent');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showQRDisplay, setShowQRDisplay] = useState<{ address: string; label?: string } | null>(
    null,
  );
  const [editAddress, setEditAddress] = useState({
    id: '',
    name: '',
    address: '',
    description: '',
    tags: [] as string[],
    category: '',
  });
  const [newAddress, setNewAddress] = useState({
    name: '',
    address: '',
    description: '',
    tags: [] as string[],
    category: '',
  });
  const [newTag, setNewTag] = useState('');
  const [editNewTag, setEditNewTag] = useState('');

  // Define loadAddresses as a useCallback to avoid dependency loops
  const loadAddresses = useCallback(async () => {
    try {
      const savedAddresses = await StorageService.getSavedAddresses();

      // Extract all unique tags from addresses
      const tagSet = new Set<string>();
      savedAddresses.forEach((addr) => {
        if (addr.tags && addr.tags.length > 0) {
          addr.tags.forEach((tag) => tagSet.add(tag));
        }
      });
      setAllTags(Array.from(tagSet).sort());

      // Sort by most recently used, then by name
      const sortedAddresses = savedAddresses.sort((a, b) => {
        // Sort based on selected sort order
        if (sortOrder === 'recent') {
          if (a.lastUsed && b.lastUsed) {
            return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
          }
          if (a.lastUsed && !b.lastUsed) return -1;
          if (!a.lastUsed && b.lastUsed) return 1;
        } else if (sortOrder === 'name') {
          return a.name.localeCompare(b.name);
        } else if (sortOrder === 'usage') {
          return (b.useCount || 0) - (a.useCount || 0);
        }
        // Default sort by name
        return a.name.localeCompare(b.name);
      });

      setAddresses(sortedAddresses);
    } catch (error) {
      toast.error('Failed to load addresses', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [sortOrder]);

  // Load addresses on initial mount
  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const handleSaveNew = async () => {
    if (!newAddress.name.trim() || !newAddress.address.trim()) return;

    const addressData: SavedAddress = {
      id: '',
      name: newAddress.name.trim(),
      address: newAddress.address.trim(),
      description: newAddress.description.trim() || undefined,
      dateAdded: new Date(),
      useCount: 0,
      tags: newAddress.tags.filter((tag) => tag.trim() !== ''),
      category: newAddress.category || undefined,
    };

    const success = await StorageService.saveAddress(addressData);
    if (success) {
      setNewAddress({ name: '', address: '', description: '', tags: [], category: '' });
      setIsAddingNew(false);
      await loadAddresses();
    }
  };

  const handleStartEdit = (address: SavedAddress) => {
    setEditingId(address.id);
    setIsAddingNew(false); // Close add form when opening edit
    setEditAddress({
      id: address.id,
      name: address.name,
      address: address.address,
      description: address.description || '',
      tags: address.tags || [],
      category: address.category || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editAddress.name.trim()) return;

    try {
      // Find the existing address
      const existing = addresses.find((a) => a.id === editingId);
      if (!existing) return;

      // Create updated address object, preserving other properties
      const updatedAddress: SavedAddress = {
        ...existing,
        name: editAddress.name.trim(),
        description: editAddress.description.trim() || undefined,
        tags: editAddress.tags,
        category: editAddress.category || undefined,
      };

      // Update address in storage
      await StorageService.updateAddress(updatedAddress);

      // Reset editing state
      setEditingId(null);
      setEditAddress({ id: '', name: '', address: '', description: '', tags: [], category: '' });

      // Refresh the list
      await loadAddresses();
    } catch (error) {
      toast.error('Failed to update address', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditAddress({ id: '', name: '', address: '', description: '', tags: [], category: '' });
  };

  const handleDelete = async (addressId: string) => {
    setShowDeleteConfirm(null);
    const success = await StorageService.deleteAddress(addressId);
    if (success) {
      await loadAddresses();
    }
  };

  const handleSelect = async (address: SavedAddress) => {
    await StorageService.updateAddressUsage(address.address);
    onSelectAddress(address.address);
    await loadAddresses(); // Refresh to update usage stats
  };

  const handleQRScan = (result: QRScanResult) => {
    setNewAddress({
      ...newAddress,
      address: result.address,
      name: result.label || '',
    });
    setIsAddingNew(true);
    setEditingId(null); // Close any open edit form
    toast.success('Address scanned successfully');
  };

  const showQRCode = (address: SavedAddress) => {
    setShowQRDisplay({
      address: address.address,
      label: address.name,
    });
  };

  const filteredAddresses = addresses.filter((addr) => {
    // First apply search query filter
    const matchesSearch =
      !searchQuery ||
      addr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      addr.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (addr.description && addr.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (addr.tags && addr.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())));

    // Then apply tag filter
    const matchesTag = !selectedTag || (addr.tags && addr.tags.includes(selectedTag));

    // Apply category filter
    const matchesCategory = !selectedCategory || addr.category === selectedCategory;

    return matchesSearch && matchesTag && matchesCategory;
  });

  return (
    <div className="space-y-4 mx-2 my-2 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-medium text-foreground dark:text-white">
          Address Book ({addresses.length})
        </h3>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowQRScanner(true)}
            className="text-avian-600 hover:text-avian-200 "
          >
            <QrCode className="w-4 h-4 mr-1" />
            Scan QR
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsAddingNew(true);
              setEditingId(null); // Close any open edit form
            }}
            className="text-avian-600 hover:text-avian-200"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Address
          </Button>
        </div>
      </div>

      {/* Search and Filter Controls */}
      {addresses.length > 0 && (
        <div className="space-y-3 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search addresses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Sort and Filter Options */}
          <div className="flex flex-wrap gap-2">
            {/* Sort Options */}
            <div className="flex items-center">
              <span className="text-xs text-muted-foreground mr-2">Sort:</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="text-xs border border-input bg-background text-foreground rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="recent">Recent</option>
                <option value="name">Name</option>
                <option value="usage">Usage</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center">
              <span className="text-xs text-muted-foreground mr-2">Category:</span>
              <select
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value || null)}
                className="text-xs border border-input bg-background text-foreground rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All Categories</option>
                {DEFAULT_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tag Filter */}
            {allTags.length > 0 && (
              <div className="flex items-center flex-wrap gap-1 ml-auto">
                <span className="text-xs text-muted-foreground mr-1">
                  Filter by tag:
                </span>
                <Button
                  variant={selectedTag === null ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setSelectedTag(null)}
                  className={`text-xs h-6 px-2 ${
                    selectedTag === null ? 'bg-avian-600 hover:bg-avian-700 text-white' : ''
                  }`}
                >
                  All
                </Button>
                {allTags.map((tag) => (
                  <Button
                    key={tag}
                    variant={tag === selectedTag ? 'default' : 'secondary'}
                    size="sm"
                    onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                    className={`text-xs h-6 px-2 ${
                      tag === selectedTag ? 'bg-avian-600 hover:bg-avian-700 text-white' : ''
                    }`}
                  >
                    {tag}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add New Address Form */}
      {isAddingNew && (
        <div className="p-4 border border-avian-200 dark:border-avian-800 rounded-lg bg-avian-50 dark:bg-avian-900/30 shadow-sm flex-shrink-0">
          <h3 className="text-lg font-semibold text-avian-900 dark:text-avian-200 mb-3">
            Add New Address
          </h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="address-name" className="text-sm font-medium">
                Address Name
              </Label>
              <Input
                id="address-name"
                type="text"
                placeholder="e.g., Exchange, Friend, Business"
                value={newAddress.name}
                onChange={(e) => setNewAddress({ ...newAddress, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="avn-address" className="text-sm font-medium">
                AVN Address
              </Label>
              <Input
                id="avn-address"
                type="text"
                placeholder="Enter the AVN address"
                value={newAddress.address}
                onChange={(e) => setNewAddress({ ...newAddress, address: e.target.value })}
                className="mt-1 font-mono"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-sm font-medium">
                Description (Optional)
              </Label>
              <Input
                id="description"
                type="text"
                placeholder="Additional notes about this address"
                value={newAddress.description}
                onChange={(e) => setNewAddress({ ...newAddress, description: e.target.value })}
                className="mt-1"
              />
            </div>

            {/* Category Selection */}
            <div>
              <Label htmlFor="category" className="text-sm font-medium">
                Category (Optional)
              </Label>
              <Select
                value={newAddress.category}
                onValueChange={(value) => setNewAddress({ ...newAddress, category: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_CATEGORIES.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.icon} {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div>
              <Label className="text-sm font-medium">Tags</Label>
              <div className="space-y-2 mt-1">
                <div className="flex flex-wrap gap-2">
                  {newAddress.tags.map((tag, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="bg-avian-100 text-avian-800 dark:bg-avian-900 dark:text-avian-200 flex items-center gap-1"
                    >
                      {tag}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-1 h-4 w-4 p-0 hover:text-destructive transition-colors"
                        onClick={() =>
                          setNewAddress({
                            ...newAddress,
                            tags: newAddress.tags.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Add a tag"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    className="flex-1"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newTag.trim()) {
                        e.preventDefault();
                        if (!newAddress.tags.includes(newTag.trim())) {
                          setNewAddress({
                            ...newAddress,
                            tags: [...newAddress.tags, newTag.trim()],
                          });
                        }
                        setNewTag('');
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      if (newTag.trim() && !newAddress.tags.includes(newTag.trim())) {
                        setNewAddress({
                          ...newAddress,
                          tags: [...newAddress.tags, newTag.trim()],
                        });
                        setNewTag('');
                      }
                    }}
                    className="bg-avian-600 hover:bg-avian-700"
                  >
                    Add
                  </Button>
                </div>

                {allTags.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    Existing tags:{' '}
                    {allTags.map((tag, i) => (
                      <Button
                        key={i}
                        variant="link"
                        size="sm"
                        onClick={() => {
                          if (!newAddress.tags.includes(tag)) {
                            setNewAddress({
                              ...newAddress,
                              tags: [...newAddress.tags, tag],
                            });
                          }
                        }}
                        className="text-xs h-auto p-0 ml-1 text-current underline hover:text-avian-600"
                      >
                        {tag}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                onClick={handleSaveNew}
                disabled={!newAddress.name.trim() || !newAddress.address.trim()}
                className="flex-1 bg-avian-600 hover:bg-avian-700 disabled:opacity-50"
              >
                <Check className="w-4 h-4 mr-2" />
                Save Address
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsAddingNew(false);
                  setNewAddress({ name: '', address: '', description: '', tags: [], category: '' });
                }}
                className="flex-1"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Address Form */}
      {editingId && (
        <div className="p-6 border border-avian-200 dark:border-avian-800 rounded-lg bg-avian-50 dark:bg-avian-900/30 shadow-sm mb-4 flex-shrink-0">
          <h3 className="text-lg font-semibold text-avian-900 dark:text-avian-200 mb-4">
            Edit Address
          </h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-address-name" className="text-sm font-medium">
                Address Name
              </Label>
              <Input
                id="edit-address-name"
                type="text"
                placeholder="Address name"
                value={editAddress.name}
                onChange={(e) => setEditAddress({ ...editAddress, name: e.target.value })}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="edit-description" className="text-sm font-medium">
                Description (Optional)
              </Label>
              <Input
                id="edit-description"
                type="text"
                placeholder="Description (optional)"
                value={editAddress.description}
                onChange={(e) => setEditAddress({ ...editAddress, description: e.target.value })}
                className="mt-2"
              />
            </div>

            {/* Category Selection */}
            <div>
              <Label htmlFor="edit-category" className="text-sm font-medium">
                Category
              </Label>
              <Select
                value={editAddress.category}
                onValueChange={(value) => setEditAddress({ ...editAddress, category: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select a category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_CATEGORIES.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.icon} {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Avatar Preview */}
            <div>
              <Label className="text-sm font-medium">Avatar Preview</Label>
              <div className="flex items-center gap-3 mt-2">
                <ContactAvatar
                  name={editAddress.name || 'Contact'}
                  address={editAddress.address || 'contact'}
                  size="lg"
                />
                <div className="text-sm text-muted-foreground">
                  Avatar is automatically generated from the address
                </div>
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label className="text-sm font-medium">Tags</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {editAddress.tags.map((tag, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="bg-avian-100 text-avian-800 dark:bg-avian-900 dark:text-avian-200 flex items-center gap-1"
                  >
                    {tag}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1 h-4 w-4 p-0 hover:text-destructive"
                      onClick={() =>
                        setEditAddress({
                          ...editAddress,
                          tags: editAddress.tags.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2 mt-2">
                <Input
                  type="text"
                  placeholder="Add a tag"
                  value={editNewTag}
                  onChange={(e) => setEditNewTag(e.target.value)}
                  className="flex-1"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && editNewTag.trim()) {
                      e.preventDefault();
                      if (!editAddress.tags.includes(editNewTag.trim())) {
                        setEditAddress({
                          ...editAddress,
                          tags: [...editAddress.tags, editNewTag.trim()],
                        });
                      }
                      setEditNewTag('');
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={() => {
                    if (editNewTag.trim() && !editAddress.tags.includes(editNewTag.trim())) {
                      setEditAddress({
                        ...editAddress,
                        tags: [...editAddress.tags, editNewTag.trim()],
                      });
                      setEditNewTag('');
                    }
                  }}
                  className="bg-avian-600 hover:bg-avian-700"
                >
                  Add
                </Button>
              </div>
              {allTags.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  Existing tags:{' '}
                  {allTags.map((tag, i) => (
                    <Button
                      key={i}
                      variant="link"
                      size="sm"
                      onClick={() => {
                        if (!editAddress.tags.includes(tag)) {
                          setEditAddress({
                            ...editAddress,
                            tags: [...editAddress.tags, tag],
                          });
                        }
                      }}
                      className="text-xs h-auto p-0 ml-1 text-current underline hover:text-avian-600"
                    >
                      {tag}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSaveEdit}
                disabled={!editAddress.name.trim()}
                className="flex-1 bg-avian-600 hover:bg-avian-700 disabled:opacity-50"
              >
                <Check className="w-4 h-4 mr-1" />
                Save Changes
              </Button>
              <Button variant="secondary" onClick={handleCancelEdit} className="flex-1">
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="p-4 border border-destructive/30 bg-destructive/10 rounded-lg mb-4 flex-shrink-0">
          <p className="text-sm text-destructive mb-3">
            Are you sure you want to delete this address? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" onClick={() => handleDelete(showDeleteConfirm)}>
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(null)}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Address List */}
      <div
        className={`space-y-2 ${isAddingNew || editingId ? 'max-h-64 overflow-y-auto' : 'flex-1 overflow-y-auto'} min-h-0 border-t border-avian-100 dark:border-avian-800 pt-2`}
      >
        {filteredAddresses.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? 'No addresses match your search' : 'No saved addresses'}
          </div>
        ) : (
          filteredAddresses.map((address) => (
            <div
              key={address.id}
              className={`p-3 border rounded-lg transition-colors cursor-pointer ${
                currentAddress === address.address
                  ? 'border-avian-500 bg-avian-50 dark:bg-avian-900/20'
                  : 'border-avian-100 dark:border-avian-900/30 hover:border-avian-300 dark:hover:border-avian-700 bg-avian-50/50 dark:bg-avian-900/10'
              }`}
              onClick={() => handleSelect(address)}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <ContactAvatar name={address.name} address={address.address} size="md" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {address.isOwnWallet ? (
                      <Coins className="w-4 h-4 text-avian-600 flex-shrink-0" />
                    ) : (
                      address.category && (
                        <span className="text-sm">
                          {DEFAULT_CATEGORIES.find((cat) => cat.id === address.category)?.icon ||
                            '📋'}
                        </span>
                      )
                    )}
                    <span className="font-medium text-sm text-foreground dark:text-white truncate">
                      {address.name}
                    </span>
                    {address.isOwnWallet && (
                      <span className="text-xs px-2 py-1 bg-avian-100 dark:bg-avian-900 text-avian-800 dark:text-avian-200 rounded-full font-medium">
                        My Wallet
                      </span>
                    )}
                    {address.category && !address.isOwnWallet && (
                      <span className="text-xs px-2 py-1 bg-muted/40 dark:bg-card text-muted-foreground rounded-full">
                        {DEFAULT_CATEGORIES.find((cat) => cat.id === address.category)?.name}
                      </span>
                    )}
                    {address.useCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ({address.useCount} uses)
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-muted-foreground truncate">
                    {address.address}
                  </div>
                  {address.description && (
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {address.description}
                    </div>
                  )}
                  {/* Tags */}
                  {address.tags && address.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {address.tags.map((tag, index) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="bg-avian-50 text-avian-600 dark:bg-avian-900/30 dark:text-avian-400 cursor-pointer hover:bg-avian-100 dark:hover:bg-avian-900/50 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTag(tag === selectedTag ? null : tag);
                          }}
                        >
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {address.lastUsed && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      Last used: {new Date(address.lastUsed).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      showQRCode(address);
                    }}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-avian-500"
                    title="Show QR Code"
                  >
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(address);
                    }}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(address.id);
                    }}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScan={handleQRScan}
      />

      {/* QR Display Modal */}
      {showQRDisplay && (
        <QRDisplayModal
          isOpen={true}
          onClose={() => setShowQRDisplay(null)}
          address={showQRDisplay.address}
          label={showQRDisplay.label}
        />
      )}
    </div>
  );
}
