"use client";

import { useState, useEffect } from "react";
import { searchService } from "@/lib/services/search";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from "fumadocs-ui/components/dialog/search";
import CustomSearchItem from "./CustomSearchItem";
import { AISearchTrigger } from "../ai";
import { Button } from "../ui/button";
import { Sparkles } from "lucide-react";

export interface SearchResult {
  objectID: string;
  title: string;
  content: string;
  url: string;
  type: "page" | "heading" | "text";
  section?: string;
  _highlightResult?: {
    title?: { value: string };
    content?: { value: string };
  };
}

export default function MySearchDialog(props: SharedProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiSearchOpen, setAiSearchOpen] = useState<boolean>();

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);

    try {
      const searchResults = await searchService.search({
        query: searchQuery,
        hitsPerPage: 20,
      });
      setResults(searchResults as unknown as SearchResult[]);
    } catch (error) {
      console.error("Search error:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle item click
  const handleItemClick = (item: SearchResult) => {
    window.location.href = item.url;
  };

  if (aiSearchOpen) {
    return <AISearchTrigger open={aiSearchOpen} setOpen={setAiSearchOpen} />;
  }

  return (
    <SearchDialog
      search={query}
      onSearchChange={setQuery}
      isLoading={loading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <Button
            onClick={() => {
              setAiSearchOpen(true);
              if (props.onOpenChange) {
                props.onOpenChange(false);
              }
            }}
            variant="grow"
            size="sm"
            className="cursor-pointer"
          >
            <Sparkles />
          </Button>

          <SearchDialogClose />
        </SearchDialogHeader>

        <SearchDialogList
          items={
            results.length > 0
              ? results.map((result) => ({
                  ...result,
                  id: result.objectID,
                }))
              : null
          }
          Item={({ item }) => (
            <div
              onClick={() => handleItemClick(item as unknown as SearchResult)}
            >
              <CustomSearchItem item={item as unknown as SearchResult} />
            </div>
          )}
        />

        <SearchDialogFooter>
          <div className="flex items-center justify-between w-full text-xs text-fd-muted-foreground">
            <div className="flex items-center gap-4">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
            <a
              href="https://algolia.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-fd-foreground transition-colors"
            >
              Search powered by Algolia
            </a>
          </div>
        </SearchDialogFooter>
      </SearchDialogContent>
    </SearchDialog>
  );
}
