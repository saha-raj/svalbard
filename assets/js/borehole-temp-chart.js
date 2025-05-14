document.addEventListener('DOMContentLoaded', () => {
    console.log("Borehole Temperature Chart Script Loaded");

    // --- Configuration ---
    const dataUrl = 'assets/data/svalbard_borehole_data_weekly_3.csv';
    const chartDivId = '#borehole-temp-chart'; // This is where the SVG is appended
    const chartOuterContainerId = '#borehole-temp-chart-outer-container'; // Used for available width

    const margin = { top: 70, right: 50, bottom: 70, left: 70 }; 
    // Aspect ratio is 1:1 for the chart plot area (width/height inside margins)
    // The SVG itself will be sized to contain this plot area + margins.
    let chartPlotWidth, chartPlotHeight; // Dimensions of the plotting area (inside margins)
    const animationSpeedMs = 30; // Much faster animation
    const chartSizeFactor = 0.7; // Chart plot area will try to be 70% of limiting dimension
    const tickFontSize = '14px'; // Increased tick font size
    const axisLabelFontSize = '16px'; // Increased axis label font size

    // --- D3 Setup ---
    const chartDiv = d3.select(chartDivId);
    const svg = chartDiv.append('svg') // Append SVG to #borehole-temp-chart
        .attr('class', 'borehole-temp-svg');
        // .style('background-color', 'none'); 


    const chartGroup = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear().domain([-7, 7]); // Fixed X-axis domain
    const yScale = d3.scaleLinear(); 

    const lineGenerator = d3.line()
        .x(d => xScale(d.temperature))
        .y(d => yScale(d.depth))
        .curve(d3.curveMonotoneY); // Smoother line for temperature profiles

    // Date display needs to be relative to SVG, not chartGroup, if chartGroup moves with margins.
    // Or, position it within chartGroup but use negative coordinates carefully.
    const dateLabelSvg = svg.append('text') // Appending to SVG, not chartGroup, to be independent of chartGroup's transform
        .attr('class', 'chart-date-label-svg')
        .attr('x', margin.left) // Position relative to SVG left + left margin
        .attr('y', margin.top / 2 + 10) // Position in the middle of the top margin area
        .attr('text-anchor', 'start')
        .style('font-family', '"Lato", sans-serif') // Changed font
        .style('font-size', '24px') 
        .style('font-weight', 'bold')
        .style('fill', '#495057'); // Changed fill color

    // --- Data Loading and Processing ---
    async function loadData() {
        try {
            const rawData = await d3.csv(dataUrl);
            if (rawData.length === 0) {
                console.error("CSV data is empty."); return null;
            }
            const depths = rawData.columns.slice(1).filter(col => !isNaN(parseFloat(col)) && isFinite(col)).map(parseFloat);
            const processedData = rawData.map(row => {
                const date = d3.timeParse("%Y-%m-%d")(row.date);
                if (!date) return null;
                const temperatureProfile = depths.map(depth => ({
                    depth,
                    temperature: parseFloat(row[String(depth)])
                })).filter(d => !isNaN(d.temperature) && d.temperature !== null);
                return { date, temperatureProfile, zeroCrossingDepth: parseFloat(row.Zero_Crossing_Depth) };
            }).filter(d => d !== null && d.temperatureProfile.length > 0);
            console.log(`Processed ${processedData.length} valid data points.`);
            return processedData;
        } catch (error) {
            console.error("Error loading or processing data:", error);
            return null;
        }
    }

    // --- Chart Drawing and Animation ---
    let animationFrameId = null;
    let currentIndex = 0;
    let allData = null;

    function drawStaticFirstFrame(firstDataPoint) {
        if (!firstDataPoint || !firstDataPoint.temperatureProfile) return;

        chartGroup.append('path')
            .datum(firstDataPoint.temperatureProfile)
            .attr('class', 'temp-profile-line-static')
            .attr('fill', 'none')
            .attr('stroke', '#cccccc') // Light grey for static line
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '2,2')
            .attr('d', lineGenerator);
        
        // Annotation for the static line
        const annotationX = xScale(-6); // Approx -5C position
        const annotationY = yScale(18);   // Approx 18m depth position

        if (isFinite(annotationX) && isFinite(annotationY)) {
             chartGroup.append('text')
                .attr('class', 'static-line-annotation')
                .attr('x', annotationX)
                .attr('y', annotationY)
                .attr('dy', '-0.5em')
                .attr('text-anchor', 'start') // Changed to start for left-alignment
                .style('font-family', '"JetBrains Mono", monospace')
                .style('font-size', '14px')
                .style('fill', '#777')
                .text('Sept 2008'); // Changed text
        }
    }

    function updateChart(dataPoint) {
        if (!dataPoint || !dataPoint.temperatureProfile) return;
        
        chartGroup.selectAll('.temp-profile-line-animated') // Changed class for animated line
            .data([dataPoint.temperatureProfile])
            .join(
                enter => enter.append('path')
                    .attr('class', 'temp-profile-line-animated')
                    .attr('fill', 'none')
                    .attr('stroke', '#7d8597') 
                    .attr('stroke-width', 4) 
                    .attr('d', lineGenerator)
                    .style('opacity', 0)
                    .call(enter => enter.transition().duration(animationSpeedMs / 2).style('opacity', 1)),
                update => update
                    .call(update => update.transition().duration(animationSpeedMs / 2).attr('d', lineGenerator)),
                exit => exit // Should not happen if we loop, but good practice
                    .call(exit => exit.transition().duration(animationSpeedMs / 2).style('opacity', 0).remove())
            );
        
        dateLabelSvg.text(d3.timeFormat("%Y %B")(dataPoint.date));
    }

    function animateChart() {
        if (!allData || allData.length === 0) return;
        updateChart(allData[currentIndex]);
        currentIndex = (currentIndex + 1) % allData.length;
        animationFrameId = setTimeout(animateChart, animationSpeedMs);
    }

    function stopAnimation() {
        if (animationFrameId) {
            clearTimeout(animationFrameId);
            animationFrameId = null;
        }
    }
    
    function startAnimation() {
        if (animationFrameId === null && allData && allData.length > 0) {
            animateChart();
        }
    }

    // --- Responsive Sizing ---
    function resizeChart() {
        const outerContainerNode = document.querySelector(chartOuterContainerId);
        const chartDivNode = document.querySelector(chartDivId);

        if (!outerContainerNode || !chartDivNode) {
            console.error("Chart container elements not found for sizing.");
            return;
        }

        const availableWidthForOuterContainer = outerContainerNode.getBoundingClientRect().width;
        const viewportHeight = window.innerHeight;

        // Determine max size for the plot area, aiming for chartSizeFactor of the limiting dimension
        const maxPlotSizeFromHeight = (viewportHeight * chartSizeFactor) - margin.top - margin.bottom;
        const maxPlotSizeFromWidth = (availableWidthForOuterContainer * chartSizeFactor) - margin.left - margin.right;
        
        chartPlotWidth = Math.min(maxPlotSizeFromWidth, maxPlotSizeFromHeight);
        chartPlotHeight = chartPlotWidth; // 1:1 aspect ratio for the plot area

        chartPlotWidth = Math.max(150, chartPlotWidth); // Min plot width increased
        chartPlotHeight = Math.max(150, chartPlotHeight); // Min plot height increased

        const finalSvgWidth = chartPlotWidth + margin.left + margin.right;
        const finalSvgHeight = chartPlotHeight + margin.top + margin.bottom;

        chartDiv.style('width', `${finalSvgWidth}px`)
                .style('height', `${finalSvgHeight}px`);

        svg.attr('width', finalSvgWidth)
           .attr('height', finalSvgHeight);
        
        console.log(`VP H: ${viewportHeight}, OuterW: ${availableWidthForOuterContainer}, PlotW: ${chartPlotWidth}, PlotH: ${chartPlotHeight}, SVG W: ${finalSvgWidth}, SVG H: ${finalSvgHeight}`);

        chartGroup.attr('transform', `translate(${margin.left},${margin.top})`);

        if (allData && allData.length > 0) {
            // xScale domain is now fixed: [-7, 7]
            const allDepths = allData.flatMap(d => d.temperatureProfile.map(p => p.depth));
            const maxDepthVal = d3.max(allDepths);

            xScale.range([0, chartPlotWidth]); // Only update range
            yScale.domain([0, maxDepthVal]).range([0, chartPlotHeight]);

            chartGroup.selectAll('.axis').remove();
            chartGroup.selectAll('.grid').remove();
            chartGroup.selectAll('.zero-line').remove();
            chartGroup.selectAll('.temp-profile-line-static').remove(); // Clear static line before redraw
            chartGroup.selectAll('.static-line-annotation').remove(); // Clear static annotation

            const xAxis = chartGroup.append('g')
                .attr('class', 'x-axis axis')
                .attr('transform', `translate(0,${chartPlotHeight})`)
                .call(d3.axisBottom(xScale)
                    .tickValues([-5, 0, 5])
                    .tickFormat(d => `${d3.format(".0f")(d)}°C`) // Added °C to tick values
                    .tickSizeOuter(0)); 
            
            xAxis.select('.domain').remove(); 
            xAxis.selectAll('text')
                .style('font-family', '"JetBrains Mono", monospace')
                .style('font-size', tickFontSize);

            xAxis.append('text') 
                .attr('class', 'axis-label')
                .attr('fill', '#333')
                .attr('x', chartPlotWidth / 2)
                .attr('y', margin.bottom - 10) // Adjusted for larger tick labels
                .attr('text-anchor', 'middle')
                .style('font-family', '"JetBrains Mono", monospace') 
                .style('font-size', axisLabelFontSize) 
                .text('Ground Temperature'); // Changed X-axis label text

            const yGridTicks = d3.range(0, maxDepthVal + 1, 10);
            chartGroup.append('g')
                .attr('class', 'y-grid grid')
                .selectAll('line')
                .data(yGridTicks)
                .enter().append('line')
                .attr('x1', 0)
                .attr('x2', chartPlotWidth)
                .attr('y1', d => yScale(d))
                .attr('y2', d => yScale(d))
                .attr('stroke', '#e0e0e0') 
                .attr('stroke-width', 1.5); // Slightly thicker solid gridlines
            
            // Add labels for Y-gridlines
            chartGroup.append('g')
                .attr('class', 'y-grid-labels axis')
                .selectAll('text')
                .data(yGridTicks)
                .enter().append('text')
                .attr('x', -12) // Adjusted for larger font
                .attr('y', d => yScale(d))
                .attr('dy', '0.32em')
                .attr('text-anchor', 'end')
                .style('font-family', '"JetBrains Mono", monospace')
                .style('font-size', tickFontSize)
                .style('fill', '#555')
                .text(d => `${d}m`);
            
            if (xScale.domain()[0] <= 0 && xScale.domain()[1] >= 0) {
                chartGroup.append('line')
                    .attr('class', 'zero-line')
                    .attr('x1', xScale(0))
                    .attr('x2', xScale(0))
                    .attr('y1', 0)
                    .attr('y2', chartPlotHeight)
                    .attr('stroke', '#555') 
                    .attr('stroke-width', 1.5);
            }

            drawStaticFirstFrame(allData[0]); // Draw the static first frame
            
            if (currentIndex > 0 && currentIndex < allData.length) {
                 updateChart(allData[currentIndex-1 < 0 ? 0 : currentIndex-1]);
            }
        }
    }

    // --- Initialization and Intersection Observer ---
    async function init() {
        allData = await loadData();
        if (!allData) {
            d3.select(chartDivId).html('<p style="color:red;">Error loading chart data.</p>');
            return;
        }
        
        resizeChart(); 
        window.addEventListener('resize', resizeChart);

        const observerOptions = {
            root: null, 
            rootMargin: '0px',
            threshold: 0.1 
        };

        const observerCallback = (entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    console.log("Chart is in view");
                    startAnimation();
                } else {
                    console.log("Chart is out of view");
                    stopAnimation();
                }
            });
        };

        const chartElement = document.querySelector(chartDivId); // Observe the div SVG is in
        if (chartElement) {
            const observer = new IntersectionObserver(observerCallback, observerOptions);
            observer.observe(chartElement);
        } else {
            console.error("Chart div element not found for Intersection Observer.");
        }
    }

    init();
}); 