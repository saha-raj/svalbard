document.addEventListener('DOMContentLoaded', async () => {
    console.log("Arctic Visualization Script Loaded");

    // --- Configuration Variables ---
    // These are the main variables you will update based on your image and SVG path.

    const IMAGE_SETTINGS = {
        width: 4096,
        height: 4728 
    };

    // IMPORTANT: For temperature overlay to align with custom ground contour,
    // CONCEPTUAL_GROUND_LINE y-values should be at or slightly ABOVE the top y-values of your custom path.
    const CONCEPTUAL_GROUND_LINE = {
        x1: 0,    y1: 1250,  // Adjusted to match example path start, or slightly less
        x2: IMAGE_SETTINGS.width, y2: 1566 // Adjust y2 to match your path's rightmost top point
    };

    const CONCEPTUAL_REFERENCE_DEPTH_LINE = {
        depth_m: 10,             // Real-world depth of this reference line in meters
        x1: 0,    y1: 3347,   // Start point (left edge of image)
        x2: IMAGE_SETTINGS.width, y2: IMAGE_SETTINGS.height    // End point (right edge of image)
    };

    const CUSTOM_GROUND_PATH_FILE = "assets/data/custom_ground_path.txt";
    const ANIMATION_DURATION_PER_MONTH = 0.1; // Seconds per month in the animation
    // --- End Configuration Variables ---
    
    // Load custom path data first
    let CUSTOM_CROSS_SECTION_PATH_D;
    try {
        const response = await fetch(CUSTOM_GROUND_PATH_FILE);
        if (!response.ok) {
            throw new Error(`Failed to load custom path data: ${response.status} ${response.statusText}`);
        }
        CUSTOM_CROSS_SECTION_PATH_D = await response.text();
        if (!CUSTOM_CROSS_SECTION_PATH_D || CUSTOM_CROSS_SECTION_PATH_D.trim() === "") {
            // If file is empty, but exists, use a default path or throw error
            // This might happen if python script runs but path ID is wrong / path is empty
             console.warn("Custom path data file loaded but was empty. Ensure SVG path ID is correct and path has data.");
            throw new Error("Custom path data file is empty."); // More specific error
        }
        console.log("Custom ground path data loaded successfully.");
    } catch (error) {
        console.error("Error loading or using custom ground path data:", error);
        // Optionally, provide a fallback default path or display an error to the user
        // For now, we'll use a very simple rectangular fallback if loading fails
        // to prevent the rest of the script from breaking entirely.
        console.warn("Using a fallback rectangular path due to loading error.");
        const fallbackTopY = Math.min(CONCEPTUAL_GROUND_LINE.y1, CONCEPTUAL_GROUND_LINE.y2);
        const fallbackBottomY = IMAGE_SETTINGS.height;
        CUSTOM_CROSS_SECTION_PATH_D = `M0,${fallbackTopY} L${IMAGE_SETTINGS.width},${fallbackTopY} L${IMAGE_SETTINGS.width},${fallbackBottomY} L0,${fallbackBottomY} Z`;
    }

    // We need to determine the actual min/max Y of the custom ground path for the gradient.
    const groundPathApproxMinY = Math.min(CONCEPTUAL_GROUND_LINE.y1, CONCEPTUAL_GROUND_LINE.y2); // 863 is the start of the path in current example
    const groundPathMaxY = IMAGE_SETTINGS.height; // Path extends to bottom

    const DATA_COLUMNS_DEPTHS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 19];
    const MAX_DATA_DEPTH = 19;
    
    const conceptualPixelsPerMeterAtX0 = 
        (CONCEPTUAL_REFERENCE_DEPTH_LINE.y1 - CONCEPTUAL_GROUND_LINE.y1) / CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m;
    const VISUALIZATION_MAX_DEPTH = 
        (groundPathMaxY - CONCEPTUAL_GROUND_LINE.y1) / conceptualPixelsPerMeterAtX0;
    console.log(`Calculated Max Visible Depth (approx): ${VISUALIZATION_MAX_DEPTH.toFixed(2)}m`);

    const svg = d3.select("#arctic-svg-overlay")
        .attr("viewBox", `0 0 ${IMAGE_SETTINGS.width} ${IMAGE_SETTINGS.height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const depthGradientColors = { start: "#B2A496", end: "#5E3719" };
    const tempOverlayColorScale = d3.scaleLinear()
        .domain([-20, 0, 30]).range(["#A7CBDC", "#FFFFFF", "#F09696"]).clamp(true);

    function getYForDepth(depthInMeters, xPosition) {
        const groundYAtX = CONCEPTUAL_GROUND_LINE.y1 + (CONCEPTUAL_GROUND_LINE.y2 - CONCEPTUAL_GROUND_LINE.y1) * (xPosition / IMAGE_SETTINGS.width);
        const refDepthYAtX = CONCEPTUAL_REFERENCE_DEPTH_LINE.y1 + (CONCEPTUAL_REFERENCE_DEPTH_LINE.y2 - CONCEPTUAL_REFERENCE_DEPTH_LINE.y1) * (xPosition / IMAGE_SETTINGS.width);
        const currentPixelsPerRefDepth = refDepthYAtX - groundYAtX;
        const currentPixelsPerMeter = currentPixelsPerRefDepth / CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m;
        return groundYAtX + (depthInMeters * currentPixelsPerMeter);
    }

    const defs = svg.append("defs");

    const clipPath = defs.append("clipPath")
        .attr("id", "cross-section-clip")
        .append("path")
        .attr("d", CUSTOM_CROSS_SECTION_PATH_D);

    const depthLinearGradient = defs.append("linearGradient")
        .attr("id", "depth-gradient")
        .attr("gradientUnits", "userSpaceOnUse") 
        .attr("x1", 0).attr("y1", groundPathApproxMinY) 
        .attr("x2", 0).attr("y2", groundPathMaxY);    
    depthLinearGradient.append("stop").attr("offset", "0%").attr("stop-color", depthGradientColors.start);
    depthLinearGradient.append("stop").attr("offset", "100%").attr("stop-color", depthGradientColors.end);

    const staticLinesGroup = svg.append("g").attr("id", "static-lines");
    const crossSectionVisualsGroup = svg.append("g")
        .attr("id", "cross-section-visuals")
        .attr("clip-path", "url(#cross-section-clip)");

    crossSectionVisualsGroup.append("path")
        .attr("id", "static-depth-gradient-path")
        .attr("d", CUSTOM_CROSS_SECTION_PATH_D)
        .style("fill", "url(#depth-gradient)");

    const temperatureOverlayGroup = crossSectionVisualsGroup.append("g")
        .attr("id", "temperature-overlay-group")
        .style("opacity", 0.5);

    const frostLine = crossSectionVisualsGroup.append("line")
        .attr("id", "frost-line")
        .attr("stroke", "#333333").attr("stroke-width", 7).attr("stroke-dasharray", "15,7");

    const depthScaleGroup = svg.append("g").attr("id", "depth-scale").style("opacity", 0);
    const monthYearDisplay = svg.append("text")
        .attr("id", "month-year-display")
        .attr("x", 70).attr("y", 120).attr("font-family", "Lato, sans-serif")
        .attr("font-size", "90px").attr("font-weight", "bold").attr("fill", "black")
        .style("opacity", 0);
    
    staticLinesGroup.append("text") 
        .attr("x", 50).attr("y", CONCEPTUAL_GROUND_LINE.y1 - 20) 
        .text("Ground Level (defined by custom contour)").attr("font-family", "sans-serif")
        .attr("font-size", "50px").attr("fill", "black");
    
    staticLinesGroup.append("text") 
        .attr("x", 50).attr("y", getYForDepth(CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m, 50) - 15) 
        .text(`Approx. ${CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m}m Depth (perspective ref)`).attr("font-family", "sans-serif")
        .attr("font-size", "50px").attr("fill", "darkgrey");

    const yAt19m_conceptual_start = getYForDepth(MAX_DATA_DEPTH, 0);
    if (yAt19m_conceptual_start <= IMAGE_SETTINGS.height) { 
        staticLinesGroup.append("text")
            .attr("x", 50).attr("y", yAt19m_conceptual_start - 10)
            .text(`${MAX_DATA_DEPTH}m Depth (Max Data)`).attr("font-family", "sans-serif")
            .attr("font-size", "40px").attr("fill", "#777777");
    }

    DATA_COLUMNS_DEPTHS.slice(0, -1).forEach((topLayerDepthMeters, i) => {
        const bottomLayerDepthMeters = DATA_COLUMNS_DEPTHS[i+1];
        const y1_start_conceptual = getYForDepth(topLayerDepthMeters, 0);
        const y1_end_conceptual = getYForDepth(topLayerDepthMeters, IMAGE_SETTINGS.width);
        const y2_start_conceptual = getYForDepth(bottomLayerDepthMeters, 0);
        const y2_end_conceptual = getYForDepth(bottomLayerDepthMeters, IMAGE_SETTINGS.width);

        temperatureOverlayGroup.append("polygon")
            .attr("class", `temp-layer temp-layer-${String(topLayerDepthMeters).replace('.', '-')}`)
            .attr("points", `${0},${y1_start_conceptual} ${IMAGE_SETTINGS.width},${y1_end_conceptual} ${IMAGE_SETTINGS.width},${y2_end_conceptual} ${0},${y2_start_conceptual}`)
            .attr("stroke", "none");
    });

    d3.csv("assets/data/svalbard_borehole_data_1.csv").then(dataset => {
        const processedData = dataset.map(d => {
            const row = { MonthDisplay: d.Month };
            row.Month = d3.timeParse("%Y-%m")(d.Month);
            DATA_COLUMNS_DEPTHS.forEach(depthKey => {
                row[String(depthKey)] = d[String(depthKey)] !== "" && d[String(depthKey)] !== undefined ? +d[String(depthKey)] : null;
            });
            row.Zero_Crossing_Depth = d.Zero_Crossing_Depth !== "" && d.Zero_Crossing_Depth !== undefined ? +d.Zero_Crossing_Depth : null;
            return row;
        }).filter(d => d.Month !== null && d.Month <= new Date('2019-12-31'));
        console.log(`Processed ${processedData.length} data entries.`);

        function drawTemperatureLayers(monthData) {
            DATA_COLUMNS_DEPTHS.slice(0, -1).forEach(topLayerDepthMeters => {
                const tempAtTopLayer = monthData[String(topLayerDepthMeters)];
                const layerPolygon = temperatureOverlayGroup.select(`.temp-layer-${String(topLayerDepthMeters).replace('.', '-')}`);
                if (tempAtTopLayer !== null && tempAtTopLayer !== undefined && !layerPolygon.empty()) {
                    layerPolygon.attr("fill", tempOverlayColorScale(tempAtTopLayer));
                } else if (!layerPolygon.empty()){
                    layerPolygon.attr("fill", "none"); 
                }
            });
        }

        function updateFrostLine(monthData) {
            if (monthData.Zero_Crossing_Depth !== null && monthData.Zero_Crossing_Depth !== undefined && monthData.Zero_Crossing_Depth >= 0) {
                const yFrost_start = getYForDepth(monthData.Zero_Crossing_Depth, 0);
                const yFrost_end = getYForDepth(monthData.Zero_Crossing_Depth, IMAGE_SETTINGS.width);
                if (Math.min(yFrost_start, yFrost_end) < IMAGE_SETTINGS.height && Math.max(yFrost_start, yFrost_end) > 0){
                    frostLine
                        .attr("x1", 0).attr("y1", yFrost_start)
                        .attr("x2", IMAGE_SETTINGS.width).attr("y2", yFrost_end)
                        .style("opacity", 1).raise(); 
                } else {
                     frostLine.style("opacity", 0);
                }
            } else {
                frostLine.style("opacity", 0);
            }
        }

        if (processedData.length > 0) {
            drawTemperatureLayers(processedData[0]);
            updateFrostLine(processedData[0]);
            monthYearDisplay.text(processedData[0].MonthDisplay).style("opacity", 0);
        }

        const scrollDistanceForAnimation = processedData.length * 20;

        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: ".visualization-container",
                start: "top top",
                end: () => `+=${150 + scrollDistanceForAnimation}`,
                scrub: 1,
                pin: true,
                // markers: true
            }
        });

        tl.to({}, { duration: 0.5 }, "scene1"); 
        
        const depthScaleX = IMAGE_SETTINGS.width / 2;
        const scaleMaxDepth = CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m;
        const numberOfDivisions = 5;
        const depthScaleTickValues = [];
        for (let i = 0; i <= numberOfDivisions; i++) {
            depthScaleTickValues.push((i / numberOfDivisions) * scaleMaxDepth);
        }
        const tickLength = 30; // Horizontal length of ticks from center to one side - REDUCED

        // Main vertical line of the scale
        depthScaleGroup.append("line")
            .attr("x1", depthScaleX).attr("y1", getYForDepth(0, depthScaleX))
            .attr("x2", depthScaleX).attr("y2", getYForDepth(scaleMaxDepth, depthScaleX))
            .attr("stroke", "#efefef").attr("stroke-width", 6); // Thicker and new color

        // Ticks and labels
        depthScaleTickValues.forEach(depth => {
            // For perspective ticks, calculate y at slightly offset x positions
            const yTickStart = getYForDepth(depth, depthScaleX - tickLength);
            const yTickEnd = getYForDepth(depth, depthScaleX + tickLength);
            
            depthScaleGroup.append("line") // Tick mark
                .attr("x1", depthScaleX - tickLength).attr("y1", yTickStart)
                .attr("x2", depthScaleX + tickLength).attr("y2", yTickEnd)
                .attr("stroke", "#efefef").attr("stroke-width", 4); 
            
            // Calculate angle for skewY
            const dx = (depthScaleX + tickLength) - (depthScaleX - tickLength); // This is 2 * tickLength
            const dy = yTickEnd - yTickStart;
            const angleRad = Math.atan2(dy, dx);
            const angleDeg = angleRad * (180 / Math.PI);

            // Create a group for each text label for precise positioning and transformation
            const textGroup = depthScaleGroup.append("g")
                .attr("transform", `translate(${depthScaleX + tickLength + 30}, ${yTickEnd})`);

            textGroup.append("text")
                .text(`${depth.toFixed(0)}m`) 
                .attr("font-family", "\"JetBrains Mono\", monospace") 
                .attr("font-size", "80px")  
                .attr("fill", "#efefef")    
                .attr("text-anchor", "start") // Text will start at the translated point (0,0 of the group)
                .attr("dominant-baseline", "middle") // Vertical middle of text at (0,0 of the group)
                .attr("transform", `skewY(${angleDeg})`); 
        });

        tl.to(depthScaleGroup.node(), { opacity: 1, duration: 0.5 }, "scene2_start");
        tl.to({}, { duration: 1 }, "scene2_end"); 
        tl.to(depthScaleGroup.node(), { opacity: 0, duration: 0.5 }, "scene3_start");
        tl.to(monthYearDisplay.node(), { opacity: 1, duration: 0.5 }, "scene3_start");

        tl.call(() => {
            console.log("Start main animation loop triggered by ScrollTrigger.");
            gsap.timeline().to({}, {duration: 0.1}); 
            let mainAnimTl = gsap.timeline();
            processedData.forEach((d, index) => {
                mainAnimTl.call(() => {
                    drawTemperatureLayers(d);
                    updateFrostLine(d);
                    monthYearDisplay.text(d.MonthDisplay);
                }, [], `+=${ANIMATION_DURATION_PER_MONTH}`);
            });
        }, [], "scene3_end");

    }).catch(error => {
        console.error("Error loading or parsing CSV data:", error);
    });

    console.log("Initial setup (after path load attempt) complete. Waiting for CSV data and GSAP.");
}); 