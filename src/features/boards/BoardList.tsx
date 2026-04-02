import { useState } from 'react';
import { createPortal } from 'react-dom';
import { db, useLiveQuery, Board } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export function BoardList({ onSelect }: { onSelect: (id: string) => void }) {
    const { t } = useTranslation();
    const [showAddModal, setShowAddModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    const boards = useLiveQuery(() => db.boards.toArray()) || [];

    const filteredBoards = boards.filter((b: Board) =>
        b.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getTaskCount = (boardId: string) => {
        const boardTaskLinks = db.boardTasks.getByBoard(boardId);
        return boardTaskLinks.length;
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        await db.boards.add({
            id: uuidv4(),
            name: newName.trim(),
            createdAt: Date.now(),
        });
        setNewName('');
        setShowAddModal(false);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(t('boards.deleteBoardConfirm', { name }))) return;
        await db.boards.delete(id);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">{t('boards.title')}</h2>
                <Button onClick={() => setShowAddModal(true)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    {t('boards.addBoard')}
                </Button>
            </div>

            {boards.length > 3 && (
                <div className="relative">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                    <input
                        type="text"
                        placeholder={t('boards.searchTasks')}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                </div>
            )}

            {filteredBoards.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-16 text-center border-2 border-dashed border-muted-foreground/20 rounded-2xl bg-muted/5 animate-in fade-in zoom-in duration-500">
                    <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                    </div>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">{t('boards.title')}</h3>
                    <p className="text-sm text-muted-foreground max-w-sm text-balance mb-6">
                        {t('boards.noBoards')}
                    </p>
                    <Button onClick={() => setShowAddModal(true)} variant="secondary" className="shadow-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        {t('boards.addBoard')}
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredBoards.map((board: Board) => {
                        const taskCount = getTaskCount(board.id);
                        return (
                            <div
                                key={board.id}
                                onClick={() => onSelect(board.id)}
                                className="group relative bg-card border rounded-xl p-5 cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all duration-200 animate-in fade-in zoom-in-95 duration-300"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(board.id, board.name); }}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10"
                                        title={t('boards.deleteBoard')}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                    </button>
                                </div>
                                <h3 className="font-semibold text-foreground group-hover:text-indigo-700 transition-colors truncate">{board.name}</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    {taskCount} {t('boards.tasksCount')}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            {showAddModal && createPortal(
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-md rounded-xl shadow-lg border p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">{t('boards.addBoard')}</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <form onSubmit={handleAdd} className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block">{t('boards.boardName')}</label>
                                <input
                                    required
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder={t('boards.boardNamePlaceholder')}
                                    autoFocus
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>{t('boards.cancel')}</Button>
                                <Button type="submit">{t('boards.create')}</Button>
                            </div>
                        </form>
                    </div>
                </div>
            , document.body)}
        </div>
    );
}
