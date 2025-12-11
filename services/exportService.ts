
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import PrintLayout from '../components/PrintLayout';
import { AppState } from '../types';

export const exportToPdf = async (appState: AppState): Promise<void> => {
    // 1. Create a hidden container for rendering the print layout
    const printContainer = document.createElement('div');
    printContainer.style.position = 'absolute';
    printContainer.style.left = '-9999px';
    printContainer.style.top = '0';
    document.body.appendChild(printContainer);

    const root = createRoot(printContainer);
    
    try {
        // 2. Render the PrintLayout component into the off-screen container
        // Use React.createElement to avoid JSX in a .ts file
        root.render(React.createElement(PrintLayout, appState));
        
        // Give React time to render and for images/styles to apply
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const contentToPrint = printContainer.firstElementChild as HTMLElement;
        if (!contentToPrint) {
            throw new Error("Could not find the print content element.");
        }
        
        // 3. Capture the rendered content as a canvas
        const canvas = await html2canvas(contentToPrint, {
            scale: 2, // Use a higher scale for better resolution
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: contentToPrint.scrollWidth,
            windowHeight: contentToPrint.scrollHeight,
        });
        
        // 4. Initialize the PDF document
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // 5. Calculate dimensions and handle multi-page logic
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        // Add the first page
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;

        // Add subsequent pages if the content is too tall
        while (heightLeft > 0) {
            position = position - pdfHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;
        }
        
        // 6. Save the generated PDF
        pdf.save('travel-analysis.pdf');

    } catch (error) {
        console.error("PDF Export failed:", error);
        // Rethrow the error to be caught by the caller in App.tsx
        throw error;
    } finally {
        // 7. Clean up by unmounting the React root and removing the container
        root.unmount();
        document.body.removeChild(printContainer);
    }
};


/**
 * Parses a markdown table into a 2D array of strings for Excel export.
 * @param markdown The markdown string containing the table.
 * @returns A 2D array representing the table rows and cells.
 */
const parseMarkdownTableForExcel = (markdown: string): string[][] => {
    const allLines = markdown.trim().split('\n');
    const tableLines = allLines.filter(line => line.trim().startsWith('|'));
    const contentLines = tableLines.filter(line => !line.includes('---'));

    if (contentLines.length < 1) return [];

    const parseRow = (rowString: string): string[] => {
        let s = rowString.trim();
        if (s.startsWith('|')) s = s.substring(1);
        if (s.endsWith('|')) s = s.substring(0, s.length - 1);
        
        // Split cells, clean markdown, and handle newlines for Excel
        return s.split('|').map(cell => 
            cell.trim()
                .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markdown
                .replace(/<br\s*\/?>/g, '\n') // Convert <br> to Excel newline
        );
    };
    
    return contentLines.map(parseRow);
};


/**
 * Exports the current analysis data to an Excel (.xlsx) file.
 * @param appState The current state of the application.
 */
export const exportToExcel = async (appState: AppState): Promise<void> => {
    const { competitors, comparison, recommendations } = appState;
    const wb = XLSX.utils.book_new();

    const analyzedCompetitors = competitors.filter(c => c.analysis);

    if (analyzedCompetitors.length > 0) {
        const competitorNames = analyzedCompetitors.map(c => c.name);

        // --- Summary Sheet (with Pricing) ---
        const summaryHeaders = ['Feature', ...competitorNames];
        const summaryBody: (string | number)[][] = [
            ['Tour Name', ...analyzedCompetitors.map(c => c.analysis!.tourName || '')],
            ['Duration', ...analyzedCompetitors.map(c => c.analysis!.duration || '')],
            ['Destinations', ...analyzedCompetitors.map(c => (c.analysis!.destinations || []).join('\n'))]
        ];
        
        const maxPricingOptions = Math.max(0, ...analyzedCompetitors.map(c => c.analysis!.pricing?.length || 0));
        for (let i = 0; i < maxPricingOptions; i++) {
            summaryBody.push([
                `Pricing Period ${i + 1}`,
                ...analyzedCompetitors.map(c => c.analysis!.pricing?.[i]?.period || '')
            ]);
            summaryBody.push([
                `Price ${i + 1}`,
                ...analyzedCompetitors.map(c => {
                    const p = c.analysis!.pricing?.[i];
                    return p ? `${p.price} ${p.currency}` : '';
                })
            ]);
        }
        const summaryWs = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryBody]);
        XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

        // --- Daily Comparison Sheet ---
        const dailyHeaders = ['Day', 'Feature', ...competitorNames];
        const dailyBody: (string | number)[][] = [];
        const maxDays = Math.max(0, ...analyzedCompetitors.map(c => c.analysis!.dailyBreakdown?.length || 0));

        if (maxDays > 0) {
            for (let i = 1; i <= maxDays; i++) {
                const dayDataForCompetitors = analyzedCompetitors.map(c => c.analysis!.dailyBreakdown?.find(d => d.day === i));
                dailyBody.push(
                    [i, 'Title', ...dayDataForCompetitors.map(d => d?.title || '')],
                    [i, 'Activities', ...dayDataForCompetitors.map(d => d?.activities || '')],
                    [i, 'Meals', ...dayDataForCompetitors.map(d => (d?.meals || []).join('\n'))],
                    [i, 'Locations', ...dayDataForCompetitors.map(d => (d?.locations || []).join('\n'))]
                );
            }
            const dailyWs = XLSX.utils.aoa_to_sheet([dailyHeaders, ...dailyBody]);
            XLSX.utils.book_append_sheet(wb, dailyWs, 'Daily Comparison');
        }
        
        // --- Flights Sheet ---
        const flightsData = [['Competitor', 'Origin', 'Destination', 'Flight #', 'Departure', 'Arrival', 'Duration']];
        analyzedCompetitors.forEach(c => {
            (c.analysis!.flights || []).forEach(f => {
                flightsData.push([c.name, f.origin, f.destination, f.flightNumber, f.departureTime, f.arrivalTime, f.flightTime]);
            });
        });
        if (flightsData.length > 1) {
            const flightsWs = XLSX.utils.aoa_to_sheet(flightsData);
            XLSX.utils.book_append_sheet(wb, flightsWs, 'Flights');
        }

        // --- Inclusions/Exclusions Sheet ---
        const incExcData = [['Competitor', 'Type', 'Description']];
        analyzedCompetitors.forEach(c => {
            (c.analysis!.inclusions || []).forEach(item => incExcData.push([c.name, 'Inclusion', item]));
            (c.analysis!.exclusions || []).forEach(item => incExcData.push([c.name, 'Exclusion', item]));
        });
        const incExcWs = XLSX.utils.aoa_to_sheet(incExcData);
        XLSX.utils.book_append_sheet(wb, incExcWs, 'Inclusions & Exclusions');
    }

    // --- Insights Sheet ---
    if (recommendations) {
         const insightsWs = XLSX.utils.aoa_to_sheet([['Strategic Insights'], [recommendations]]);
         XLSX.utils.book_append_sheet(wb, insightsWs, 'Insights');
    }

    // --- Comparison Sheet ---
    if (comparison && !comparison.startsWith('Single itinerary loaded')) {
        const separator = '### Conclusion';
        let tableMarkdown = comparison;
        const conclusionIndex = comparison.indexOf(separator);
        if (conclusionIndex !== -1) {
            tableMarkdown = comparison.substring(0, conclusionIndex).trim();
        }
        
        const comparisonData = parseMarkdownTableForExcel(tableMarkdown);
        if (comparisonData.length > 0) {
            const comparisonWs = XLSX.utils.aoa_to_sheet(comparisonData);
            XLSX.utils.book_append_sheet(wb, comparisonWs, 'Comparison');
        }
    }

    // Trigger the file download
    XLSX.writeFile(wb, 'Travel_Analysis_Export.xlsx');
};
