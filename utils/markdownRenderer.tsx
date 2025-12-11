import React from 'react';

const renderCellContent = (text: string) => {
    const processLists = (content: string) => {
        const listRegex = /(?:^\s*(?:-|\*|\d+\.)\s.*(?:\r?\n|$))+/gm;
        return content.replace(listRegex, (match) => {
            const items = match.trim().split(/\r?\n/).map(item =>
                `<li class="ml-4">${item.trim().replace(/^\s*(?:-|\*|\d+\.)\s/, '')}</li>`
            ).join('');
            return `<ul class="list-disc list-outside">${items}</ul>`;
        });
    };

    const boldedHtml = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-on-surface">$1</strong>');
    const listHtml = processLists(boldedHtml);
    const finalHtml = listHtml.replace(/\n/g, '<br />');

    return <div dangerouslySetInnerHTML={{ __html: finalHtml }} />;
};

export const renderMarkdown = (markdown: string) => {
    if (!markdown) return null;

    const processedMarkdown = markdown
        .replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold text-on-surface mt-6 mb-3">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold text-on-surface mt-8 mb-4">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold text-on-surface mt-8 mb-4">$1</h1>');
        
    // Render the processed markdown, including lists and bold text, inside a prose container for consistent styling.
    return (
        <div className="prose prose-sm max-w-none text-on-surface-variant leading-relaxed">
            {renderCellContent(processedMarkdown)}
        </div>
    );
};
