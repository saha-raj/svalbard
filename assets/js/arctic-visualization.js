document.addEventListener('DOMContentLoaded', async () => {
    console.log("Arctic Visualization Script Loaded");

    // --- Configuration Variables ---
    // These are the main variables you will update based on your image and SVG path.

    const IMAGE_SETTINGS = {
        width: 1888,
        height: 2560 
    };

    // IMPORTANT: For temperature overlay to align with custom ground contour,
    // CONCEPTUAL_GROUND_LINE y-values should be at or slightly ABOVE the top y-values of your custom path.
    const CONCEPTUAL_GROUND_LINE = {
        x1: 0,    y1: 760,  // Adjusted to match example path start, or slightly less
        x2: IMAGE_SETTINGS.width, y2: 930 // Adjust y2 to match your path's rightmost top point
    };

    const CONCEPTUAL_REFERENCE_DEPTH_LINE = {
        depth_m: 4,             // Real-world depth of this reference line in meters
        // x1: 0,    y1: 3347,   // Start point (left edge of image)
        x1: 0,    y1: 2100,   // Start point (left edge of image)
        x2: IMAGE_SETTINGS.width, y2: IMAGE_SETTINGS.height    // End point (right edge of image)
    };

    const CUSTOM_GROUND_PATH_FILE = "assets/data/custom_ground_path.txt";
    const ANIMATION_DURATION_PER_DATA_POINT = 0.1; // Was ANIMATION_DURATION_PER_MONTH, reduced for weekly data
    const TEMPERATURE_PROFILE_RESOLUTION_M = 0.05; 
    const TEMPERATURE_OVERLAY_INITIAL_OPACITY = 0.5; // User changed from 0.55
    const DEPTH_GRADIENT_OPACITY = 0.2;
    const DEPTH_SCALE_DIVISIONS = 4; // Number of divisions for the depth scale

    // const FOREGROUND_IMAGE_PATH = "assets/images/foreground_land_cutout.png"; // Already in HTML
    const WEEKLY_FRAMES_BASE_PATH = "assets/images/frames/weekly/";
    // const MONTH_FILENAMES = Array.from({length: 12}, (_, i) => `${(i + 1).toString().padStart(2, '0')}.webp`); // Old

    // --- Color & Style Configurations ---
    const DEPTH_GRADIENT_COLORS = {
        start: "#4C586D", // Color at 0m (ground surface)
        end: "#292D34"    // Color at 15m (or max visible depth if less than 15m)
    };
    // const TEMPERATURE_COLOR_SCALE_CONFIG = { // No longer using continuous scale
    //     domain: [-5, 0, 5],
    //     range: ["#2C484F", "#C3DDE9", "#8e7137"] 
    // };
    const TEMP_COLOR_ABOVE_ZERO = "#716749";
    const TEMP_COLOR_BELOW_ZERO = "#378BB1";
    const FROST_LINE_STYLE = {
        stroke: "#cbf3f0", // Changed to match ANNUAL_MAX_FROST_LINE_STYLE.stroke
        strokeWidth: 2, 
        strokeDasharray: "none" , 
        strokeOpacity: 0.2
    };
    const ANNUAL_MAX_FROST_LINE_STYLE = {
        stroke: "#cbf3f0", 
        strokeWidth: 4,
        // strokeDasharray: "5,5" // Kept as per user's previous file state
        strokeOpacity: 0.8, 
        labelFill: "#364156" 
    };
    const ANNUAL_MAX_FROST_LEADER_LINE_STYLE = {
        stroke: ANNUAL_MAX_FROST_LINE_STYLE.labelFill, // Match label text color
        strokeWidth: 1.5,
        fill: "none"
    };
    const VERTICAL_LABEL_PADDING = 10; // Pixels between labels
    const LABEL_FONT_SIZE = 35; // For annual max labels
    const ESTIMATED_LABEL_HEIGHT = LABEL_FONT_SIZE * 0.8; // Approx height for collision
    // --- End Color & Style Configurations ---
    
    // --- New Animation Timing Configuration --- 
    const ANIMATION_TIMING_CONFIG = {
        // For elements that appear and might disappear before the main timelapse.
        // All 'revealAt' and 'hideAt' offsets are absolute scroll positions from the start (0) of the pinned visualization.
        // 'hideAt: null' means the element reveals and then stays visible.
        // 'transitionDuration' is the scroll-duration for the reveal OR hide animation.
        SETUP_ELEMENTS: {
            // Key: Element ID/Name, Value: { node: (selected node), revealAt, hideAt, transitionDuration, revealProps, hideProps } 
            // Note: revealProps/hideProps define the TARGET state for the animation.
            annotationText1:      { node: null, revealAt: 0.0, hideAt: 10.0,   transitionDuration: 5.0, revealProps: { y: 0, opacity: 1, ease: "power2.out" }, hideProps: { y: "-100vh", opacity: 0, ease: "power2.in" } },
            foregroundImage:      { node: null, revealAt: 10.0, hideAt: null,  transitionDuration: 5.0, revealProps: { y: IMAGE_SETTINGS.height, opacity: 1, ease: "power1.inOut" }, hideProps: null }, // Special: Reveal moves it down, hideAt is null
            annotationText2:      { node: null, revealAt: 15.0, hideAt: 35.0,  transitionDuration: 5.0, revealProps: { y: 0, opacity: 1, ease: "power2.out" }, hideProps: { y: "-100vh", opacity: 0, ease: "power2.in" } },
            depthScale:           { node: null, revealAt: 10.0, hideAt: null, transitionDuration: 5.0, revealProps: { opacity: 1, ease: "power1.inOut" }, hideProps: null }, // Adjusted duration to 0.2
            crossSectionVisuals:  { node: null, revealAt: 20.0, hideAt: null, transitionDuration: 5.0, revealProps: { opacity: 1, ease: "power1.inOut" }, hideProps: null },
            staticRefLines:       { node: null, revealAt: 10.0, hideAt: null, transitionDuration: 1.0, revealProps: { opacity: 1, ease: "power1.inOut" }, hideProps: null }, // This maps to staticLinesGroup
        },
    
        // New scene for displaying the first data point statically
        STATIC_FIRST_DATA_POINT_SCENE: {
            startAt: 20.0, // Placeholder: After annotationText3 reveals
            duration: 15.0, // Placeholder: Duration of this static display
            fadeOutDuration: 1.0 // How long it takes for frost line/temp overlay to fade before main timelapse
        },
    
        // Configuration for the main data-driven timelapse animation sequence.
        TIMELAPSE_ANIMATION: {
            // Absolute scroll offset from the timeline start (0) to begin this entire timelapse block.
            startAt: 45.0, // Placeholder: Adjusted to start after STATIC_FIRST_DATA_POINT_SCENE
    
            // Elements that are part of the timelapse (reveal at its start or animate within it).
            monthYearDisplay:     { node: null, revealTransitionDuration: 5.0 }, // Reveals at TIMELAPSE_ANIMATION.startAt
    
            dataLoop: {
                // How much "timeline duration" each data point step will occupy on the main timeline 'tl'.
                timelineDurationPerDataPoint: 0.5 // Small value for each step
            }
        },
    
        // Multiplier to convert total timeline duration to scrollable pixels for ScrollTrigger's end.
        scrollPixelsPerTimelineUnit: 100 // e.g., if total tl duration is 2, scroll distance is 400px.
    };
    // --- End New Animation Timing Configuration --- 

    let animationData = [];
    let initialDataProcessed = false;

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
    // VISUALIZATION_MAX_DEPTH determines how far down we render things. 
    // It should ideally not exceed MAX_DATA_DEPTH if we rely on CSV for temps that far.
    const VISUALIZATION_MAX_RENDER_DEPTH = Math.min(MAX_DATA_DEPTH, 
        (groundPathMaxY - CONCEPTUAL_GROUND_LINE.y1) / conceptualPixelsPerMeterAtX0
    );
    // console.log(`Max depth for rendering temperature profile: ${VISUALIZATION_MAX_RENDER_DEPTH.toFixed(2)}m`);

    const svg = d3.select("#arctic-svg-overlay")
        .attr("viewBox", `0 0 ${IMAGE_SETTINGS.width} ${IMAGE_SETTINGS.height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    // const tempOverlayColorScale = d3.scaleLinear() // No longer needed
    //     .domain(TEMPERATURE_COLOR_SCALE_CONFIG.domain)
    //     .range(TEMPERATURE_COLOR_SCALE_CONFIG.range)
    //     .clamp(true);

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

    // Gaussian Blur Filter for smoothing temperature overlay - REMOVING
    // const blurFilter = defs.append("filter")
    //     .attr("id", "gaussianBlurFilter");
    // blurFilter.append("feGaussianBlur")
    //     .attr("in", "SourceGraphic") // Apply blur to the original graphic
    //     .attr("stdDeviation", "2"); // Adjust blur amount (e.g., 0.5, 1, 2)

    const depthLinearGradient = defs.append("linearGradient")
        .attr("id", "depth-gradient")
        .attr("gradientUnits", "userSpaceOnUse") 
        .attr("x1", 0).attr("y1", groundPathApproxMinY) 
        .attr("x2", 0).attr("y2", groundPathMaxY);    
    depthLinearGradient.append("stop").attr("offset", "0%").attr("stop-color", DEPTH_GRADIENT_COLORS.start);
    depthLinearGradient.append("stop").attr("offset", "100%").attr("stop-color", DEPTH_GRADIENT_COLORS.end);

    const staticLinesGroup = svg.append("g").attr("id", "static-lines").style("opacity", 0);
    const crossSectionVisualsGroup = svg.append("g")
        .attr("id", "cross-section-visuals")
        .attr("clip-path", "url(#cross-section-clip)")
        .style("opacity", 0); // Initially hidden
        // For the "rise from bottom" effect, we will animate its transform: translateY

    crossSectionVisualsGroup.append("path")
        .attr("id", "static-depth-gradient-path")
        .attr("d", CUSTOM_CROSS_SECTION_PATH_D)
        .style("fill", "url(#depth-gradient)")
        .style("opacity", DEPTH_GRADIENT_OPACITY);

    const temperatureOverlayGroup = crossSectionVisualsGroup.append("g")
        .attr("id", "temperature-overlay-group")
        .style("opacity", 0) // START HIDDEN, will be shown when main animation begins
        // .attr("filter", "url(#gaussianBlurFilter)"); // REMOVED BLUR

    const annualMaxFrostLinesGroup = crossSectionVisualsGroup.append("g")
        .attr("id", "annual-max-frost-lines-group");

    const frostLine = crossSectionVisualsGroup.append("line")
        .attr("id", "frost-line")
        .attr("stroke", FROST_LINE_STYLE.stroke)
        .attr("stroke-width", FROST_LINE_STYLE.strokeWidth)
        .attr("stroke-dasharray", FROST_LINE_STYLE.strokeDasharray)
        .style("opacity", 0); // Initially hidden, will be shown in Scene 2 for the first data point

    const depthScaleGroup = svg.append("g").attr("id", "depth-scale").style("opacity", 0);
    const monthYearDisplay = svg.append("text")
        .attr("id", "month-year-display")
        .attr("x", 100)
        .attr("y", 180)
        .attr("font-family", "Lato, sans-serif")
        .attr("font-size", "150px")
        .attr("font-weight", "bold").attr("fill", "black")
        .style("opacity", 0);
    
    // Static lines for reference (0m and 5m labels, 19m data depth) using CONCEPTUAL lines for positioning labels
    // staticLinesGroup.append("text") 
    //     .attr("x", 50).attr("y", CONCEPTUAL_GROUND_LINE.y1 - 20) 
    //     .text("Ground Level (defined by custom contour)").attr("font-family", "sans-serif")
    //     .attr("font-size", "50px").attr("fill", "black");
    
    // staticLinesGroup.append("text") 
    //     .attr("x", 50).attr("y", getYForDepth(CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m, 50) - 15) 
    //     .text(`Approx. ${CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m}m Depth (perspective ref)`).attr("font-family", "sans-serif")
    //     .attr("font-size", "50px").attr("fill", "darkgrey");

    const yAt19m_conceptual_start = getYForDepth(MAX_DATA_DEPTH, 0);
    if (yAt19m_conceptual_start <= IMAGE_SETTINGS.height) { 
        staticLinesGroup.append("text")
            .attr("x", 50).attr("y", yAt19m_conceptual_start - 10)
            .text(`${MAX_DATA_DEPTH}m Depth (Max Data)`).attr("font-family", "sans-serif")
            .attr("font-size", "40px").attr("fill", "#777777");
    }

    // Create two polygons for temperature overlay: one above frost, one below frost
    temperatureOverlayGroup.append("polygon")
        .attr("id", "above-frost-poly")
        .attr("stroke", "none")
        .attr("fill", TEMP_COLOR_ABOVE_ZERO); // Default fill

    temperatureOverlayGroup.append("polygon")
        .attr("id", "below-frost-poly")
        .attr("stroke", "none")
        .attr("fill", TEMP_COLOR_BELOW_ZERO); // Default fill

    // Select new DOM elements
    const foregroundImage = d3.select("#foreground-land-cutout");
    const monthlyBackgroundImage = d3.select("#arctic-monthly-background-image");
    const annotationText1 = d3.select("#annotation-text-1");
    const annotationText2 = d3.select("#annotation-text-2");

    // --- Populate node references in ANIMATION_TIMING_CONFIG ---
    // This centralizes the link between config keys and the actual DOM nodes.
    ANIMATION_TIMING_CONFIG.SETUP_ELEMENTS.annotationText1.node = annotationText1.node();
    ANIMATION_TIMING_CONFIG.SETUP_ELEMENTS.foregroundImage.node = foregroundImage.node();
    ANIMATION_TIMING_CONFIG.SETUP_ELEMENTS.crossSectionVisuals.node = crossSectionVisualsGroup.node();
    ANIMATION_TIMING_CONFIG.SETUP_ELEMENTS.staticRefLines.node = staticLinesGroup.node(); // Assuming staticRefLines corresponds to staticLinesGroup
    ANIMATION_TIMING_CONFIG.SETUP_ELEMENTS.depthScale.node = depthScaleGroup.node();
    ANIMATION_TIMING_CONFIG.SETUP_ELEMENTS.annotationText2.node = annotationText2.node();
    ANIMATION_TIMING_CONFIG.TIMELAPSE_ANIMATION.monthYearDisplay.node = monthYearDisplay.node();
    // --- End Populate node references ---

    // Initial GSAP states (before any ScrollTrigger)
    gsap.set(foregroundImage.node(), { y: 0, opacity: 1 }); // Starts in place
    gsap.set(annotationText1.node(), { y: "100vh", opacity: 0 }); // Start off-screen below
    gsap.set(annotationText2.node(), { y: "100vh", opacity: 0 }); // Start off-screen below
    // crossSectionVisualsGroup, staticLinesGroup, depthScaleGroup, monthYearDisplay, temperatureOverlayGroup, frostLine
    // are already set to opacity 0 when created.
    
    // --- Initial Auto-Playing Annotation 1 Reveal (Scroll-Triggered) ---
    // REMOVED - This will be handled in the main timeline now.
    // ScrollTrigger.create({
    //     trigger: ".visualization-container", // Or a more specific trigger element if needed
    //     start: "top 80%", // Start when 80% of viewport is above the container top
    //     once: true, 
    //     onEnter: () => {
    //         console.log("Triggering Annotation Text 1 reveal.");
    //         gsap.to(annotationText1.node(), {
    //             y: 0, // Slides to its CSS defined `top` value
    //             opacity: 1,
    //             duration: 0.8,
    //             ease: "power2.out"
    //         });
    //     }
    // });

    // --- Main Scroll-Scrubbed Timeline --- 
    d3.csv("assets/data/svalbard_borehole_data_weekly_3.csv").then(dataset => { // UPDATED FILE PATH
        const parseDate = d3.timeParse("%Y-%m-%d"); // Date format in the new CSV

        const processedData = dataset.map(d => {
            const row = { 
                // MonthDisplay: d.Month, // Old column name
                originalDateString: d.date // Keep original date string for potential display
            }; 
            row.date = parseDate(d.date); // New column name is 'date'
            if (!row.date) {
                // console.warn("Could not parse date:", d.date);
                return null; // Skip rows with unparseable dates
            }
            
            DATA_COLUMNS_DEPTHS.forEach(depthKey => {
                row[String(depthKey)] = d[String(depthKey)] !== "" && d[String(depthKey)] !== undefined ? +d[String(depthKey)] : null;
            });
            row.Zero_Crossing_Depth = d.Zero_Crossing_Depth !== "" && d.Zero_Crossing_Depth !== undefined ? +d.Zero_Crossing_Depth : null;
            return row;
        }).filter(d => d.date !== null); // Removed date filter for now to process all data for annual max
        console.log(`Processed ${processedData.length} data entries for visualization.`);

        // Pre-calculate annual maximum frost depths
        const annualMaxFrostDepths = [];
        if (processedData.length > 0) {
            let currentYear = processedData[0].date.getFullYear();
            let maxDepthThisYear = -1;
            let monthIndexOfMaxThisYear = -1;
            let recordOfMaxThisYear = null;

            processedData.forEach((d, index) => {
                const year = d.date.getFullYear();
                if (year !== currentYear) {
                    if (recordOfMaxThisYear) {
                        annualMaxFrostDepths.push({
                            year: currentYear,
                            maxDepth: maxDepthThisYear,
                            monthIndex: monthIndexOfMaxThisYear, // Store index for timing
                            monthData: recordOfMaxThisYear // Store full data record for drawing
                        });
                    }
                    currentYear = year;
                    maxDepthThisYear = -1;
                    monthIndexOfMaxThisYear = -1;
                    recordOfMaxThisYear = null;
                }

                if (d.Zero_Crossing_Depth !== null && d.Zero_Crossing_Depth >= 0 && d.Zero_Crossing_Depth <= VISUALIZATION_MAX_RENDER_DEPTH) {
                    if (d.Zero_Crossing_Depth > maxDepthThisYear) {
                        maxDepthThisYear = d.Zero_Crossing_Depth;
                        monthIndexOfMaxThisYear = index;
                        recordOfMaxThisYear = d;
                    }
                }
            });
            // Add the last year's data
            if (recordOfMaxThisYear) {
                annualMaxFrostDepths.push({
                    year: currentYear,
                    maxDepth: maxDepthThisYear,
                    monthIndex: monthIndexOfMaxThisYear,
                    monthData: recordOfMaxThisYear
                });
            }
        }
        console.log("Annual Maximum Frost Depths:", annualMaxFrostDepths);

        // Filter data again if you had a date filter for the main animation
        animationData = processedData.filter(d => d.date <= new Date('2019-04-30')); // Filter with new 'date' field
        initialDataProcessed = true; // Set flag AFTER data is ready
        console.log(`Using ${animationData.length} data entries for main animation.`);

        console.log("animationData.length:", animationData.length);
        console.log("TIMELAPSE_ANIMATION.startAt:", ANIMATION_TIMING_CONFIG.TIMELAPSE_ANIMATION.startAt);
        console.log("dataLoop.timelineDurationPerDataPoint:", ANIMATION_TIMING_CONFIG.TIMELAPSE_ANIMATION.dataLoop.timelineDurationPerDataPoint);
        console.log("scrollPixelsPerTimelineUnit:", ANIMATION_TIMING_CONFIG.scrollPixelsPerTimelineUnit);

        // --- Create Depth Scale Elements (ensure this is done before tl definition) --- START
        const depthScaleX = IMAGE_SETTINGS.width / 2;
        const scaleMaxDepth = CONCEPTUAL_REFERENCE_DEPTH_LINE.depth_m;
        const depthScaleTickValues = [];
        for (let i = 0; i <= DEPTH_SCALE_DIVISIONS; i++) {
            depthScaleTickValues.push((i / DEPTH_SCALE_DIVISIONS) * scaleMaxDepth);
        }
        const tickLength = 30; 

        depthScaleGroup.append("line")
            .attr("x1", depthScaleX).attr("y1", getYForDepth(0, depthScaleX))
            .attr("x2", depthScaleX).attr("y2", getYForDepth(scaleMaxDepth, depthScaleX))
            .attr("stroke", "#efefef").attr("stroke-width", 6); 

        depthScaleTickValues.forEach(depth => {
            const yTickStart = getYForDepth(depth, depthScaleX - tickLength);
            const yTickEnd = getYForDepth(depth, depthScaleX + tickLength);
            
            depthScaleGroup.append("line") 
                .attr("x1", depthScaleX - tickLength).attr("y1", yTickStart)
                .attr("x2", depthScaleX + tickLength).attr("y2", yTickEnd)
                .attr("stroke", "#efefef").attr("stroke-width", 4); 
            
            const dxText = (depthScaleX + tickLength) - (depthScaleX - tickLength);
            const dyText = yTickEnd - yTickStart;
            const angleRadText = Math.atan2(dyText, dxText);
            const angleDegText = angleRadText * (180 / Math.PI);

            const textGroup = depthScaleGroup.append("g")
                .attr("transform", `translate(${depthScaleX + tickLength + 30}, ${yTickEnd})`);

            // Conditional formatting for tick labels
            const labelText = (depth % 1 === 0) ? `${depth.toFixed(0)}m` : `${depth.toFixed(1)}m`;

            textGroup.append("text")
                .text(labelText) 
                .attr("font-family", "\"JetBrains Mono\", monospace") 
                .attr("font-size", "40px")  
                .attr("fill", "#efefef")    
                .attr("text-anchor", "start") 
                .attr("dominant-baseline", "middle") 
                .attr("transform", `skewY(${angleDegText})`); 
        });
        // --- Create Depth Scale Elements --- END

        // Helper function to get interpolated temperature at a specific granular depth -- NO LONGER NEEDED FOR COLORING
        // function getInterpolatedTemp(granularDepth, monthData) { 
        //     // ... (keep for potential future use if detailed temp values are needed for other things, but not for coloring)
        // }

        function drawTemperatureLayers(monthData) {
            // granularDepthPoints.slice(0, -1).forEach((topLayerDepthMeters, i) => { // OLD LOGIC
            //     const layerPolygon = temperatureOverlayGroup.select(`.temp-layer-granular-${i}`); // OLD LOGIC
            //     if (layerPolygon.empty()) return; // OLD LOGIC
            //     const zeroCrossingDepth = monthData.Zero_Crossing_Depth; // OLD LOGIC
            //     if (zeroCrossingDepth !== null && zeroCrossingDepth !== undefined && zeroCrossingDepth >= 0) { // OLD LOGIC
            //         if (topLayerDepthMeters < zeroCrossingDepth) { // OLD LOGIC
            //             layerPolygon.attr("fill", TEMP_COLOR_ABOVE_ZERO); // OLD LOGIC
            //         } else { // OLD LOGIC
            //             layerPolygon.attr("fill", TEMP_COLOR_BELOW_ZERO); // OLD LOGIC
            //         } // OLD LOGIC
            //     } else { // OLD LOGIC
            //         layerPolygon.attr("fill", TEMP_COLOR_ABOVE_ZERO); // OLD LOGIC
            //     } // OLD LOGIC
            // }); // OLD LOGIC

            const aboveFrostPoly = temperatureOverlayGroup.select("#above-frost-poly");
            const belowFrostPoly = temperatureOverlayGroup.select("#below-frost-poly");

            const zeroCrossingDepth = monthData.Zero_Crossing_Depth;

            // Get Y coordinates for the ground surface (top of the entire cross-section area)
            // For simplicity, using the conceptual ground line to define the top of the colored area.
            // More accurately, this should be the top of the CUSTOM_CROSS_SECTION_PATH_D.
            // However, getYForDepth(0, x) effectively gives the ground surface y at x.
            const groundY_start = getYForDepth(0, 0); 
            const groundY_end = getYForDepth(0, IMAGE_SETTINGS.width);

            // Get Y coordinates for the maximum depth of the visualization (bottom of the cross-section area)
            // This should align with how the clip path is defined or the max render depth.
            const maxY_start = getYForDepth(VISUALIZATION_MAX_RENDER_DEPTH, 0);
            const maxY_end = getYForDepth(VISUALIZATION_MAX_RENDER_DEPTH, IMAGE_SETTINGS.width);

            if (zeroCrossingDepth !== null && zeroCrossingDepth !== undefined && zeroCrossingDepth >= 0 && zeroCrossingDepth <= VISUALIZATION_MAX_RENDER_DEPTH) {
                const yFrost_start = getYForDepth(zeroCrossingDepth, 0);
                const yFrost_end = getYForDepth(zeroCrossingDepth, IMAGE_SETTINGS.width);

                // Polygon for area above frost line
                aboveFrostPoly
                    .attr("points", `${0},${groundY_start} ${IMAGE_SETTINGS.width},${groundY_end} ${IMAGE_SETTINGS.width},${yFrost_end} ${0},${yFrost_start}`)
                    .attr("fill", TEMP_COLOR_ABOVE_ZERO);

                // Polygon for area below frost line
                belowFrostPoly
                    .attr("points", `${0},${yFrost_start} ${IMAGE_SETTINGS.width},${yFrost_end} ${IMAGE_SETTINGS.width},${maxY_end} ${0},${maxY_start}`)
                    .attr("fill", TEMP_COLOR_BELOW_ZERO);
                
            } else if (zeroCrossingDepth !== null && zeroCrossingDepth !== undefined && zeroCrossingDepth > VISUALIZATION_MAX_RENDER_DEPTH) {
                // Frost line is deeper than we render, so everything visible is "above frost"
                aboveFrostPoly
                    .attr("points", `${0},${groundY_start} ${IMAGE_SETTINGS.width},${groundY_end} ${IMAGE_SETTINGS.width},${maxY_end} ${0},${maxY_start}`)
                    .attr("fill", TEMP_COLOR_ABOVE_ZERO);
                belowFrostPoly.attr("points", ""); // No below-frost area visible

            } else {
                // No frost line (e.g., all ground is warm, or Zero_Crossing_Depth is negative like -0.5m indicating frost above ground)
                // So, the entire cross-section is the "above frost" color.
                aboveFrostPoly
                    .attr("points", `${0},${groundY_start} ${IMAGE_SETTINGS.width},${groundY_end} ${IMAGE_SETTINGS.width},${maxY_end} ${0},${maxY_start}`)
                    .attr("fill", TEMP_COLOR_ABOVE_ZERO);
                belowFrostPoly.attr("points", ""); // No below-frost area
            }
        }

        function updateFrostLine(monthData) {
            if (monthData.Zero_Crossing_Depth !== null && monthData.Zero_Crossing_Depth !== undefined && monthData.Zero_Crossing_Depth >= 0) {
                const yFrost_start = getYForDepth(monthData.Zero_Crossing_Depth, 0);
                const yFrost_end = getYForDepth(monthData.Zero_Crossing_Depth, IMAGE_SETTINGS.width);
                // Ensure frost line is only drawn if it's within the rendered depth
                if (monthData.Zero_Crossing_Depth <= VISUALIZATION_MAX_RENDER_DEPTH && Math.min(yFrost_start, yFrost_end) < IMAGE_SETTINGS.height && Math.max(yFrost_start, yFrost_end) > 0){
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

        const dateFormat = d3.timeFormat("%Y %b"); // YYYY Mon format (e.g., 2008 Sep)

        if (animationData.length > 0) { 
            // monthYearDisplay.text(dateFormat(animationData[0].date)).style("opacity", 0); // Old field
            monthYearDisplay.text(dateFormat(animationData[0].date)).style("opacity", 0); // Use .date
        }

        // --- Timeline Setup using New Config --- 
        const tlapseConfig = ANIMATION_TIMING_CONFIG.TIMELAPSE_ANIMATION;
        const dataLoopConfig = tlapseConfig.dataLoop;

        const totalTimelineDuration = tlapseConfig.startAt + (animationData.length * dataLoopConfig.timelineDurationPerDataPoint);
        const totalScrollEndPixels = totalTimelineDuration * ANIMATION_TIMING_CONFIG.scrollPixelsPerTimelineUnit;
        
        console.log("Calculated totalTimelineDuration for scroll end:", totalTimelineDuration);
        console.log("Calculated totalScrollEndPixels for ScrollTrigger end:", totalScrollEndPixels);
        
        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: ".visualization-container",
                start: "top top", 
                end: () => `+=${totalScrollEndPixels}`, // End based on timeline duration & multiplier
                scrub: 1,
                pin: true,
                // markers: true,
                onUpdate: self => {
                    const timelineValElement = document.getElementById('timeline-debug-val');
                    if (timelineValElement) {
                        timelineValElement.textContent = self.animation.time().toFixed(3);
                    }

                    const sceneValElement = document.getElementById('scene-debug-val');
                    if (sceneValElement) {
                        const currentTime = self.animation.time();
                        let sceneName = "Initial Setup (Before Any Configured Start)"; // Default
                        const config = ANIMATION_TIMING_CONFIG; // Shorthand

                        // Check Timelapse Animation first as it's likely the longest running
                        if (currentTime >= config.TIMELAPSE_ANIMATION.startAt) {
                            sceneName = `TIMELAPSE_ANIMATION (starts ${config.TIMELAPSE_ANIMATION.startAt.toFixed(1)})`;
                        } 
                        // Check Static First Data Point Scene
                        else if (config.STATIC_FIRST_DATA_POINT_SCENE && 
                                 currentTime >= config.STATIC_FIRST_DATA_POINT_SCENE.startAt && 
                                 currentTime < (config.STATIC_FIRST_DATA_POINT_SCENE.startAt + config.STATIC_FIRST_DATA_POINT_SCENE.duration)) {
                            sceneName = `STATIC_FIRST_DATA_POINT_SCENE (starts ${config.STATIC_FIRST_DATA_POINT_SCENE.startAt.toFixed(1)}, duration ${config.STATIC_FIRST_DATA_POINT_SCENE.duration.toFixed(1)})`;
                        } 
                        // Check individual SETUP_ELEMENTS
                        else if (config.SETUP_ELEMENTS) {
                            let activeSetupElementKey = null;
                            let latestStartTime = -1;

                            for (const key in config.SETUP_ELEMENTS) {
                                const elConfig = config.SETUP_ELEMENTS[key];
                                const revealAt = elConfig.revealAt;
                                const hideAt = elConfig.hideAt;
                                const transitionDuration = elConfig.transitionDuration; // Not directly used for scene *naming* here but good to have

                                // Check if current time is within this element's active phase (reveal to hide, or reveal to start of next major scene)
                                const isActive = currentTime >= revealAt && 
                                                 (hideAt === null || currentTime < hideAt);
                                
                                if (isActive && revealAt > latestStartTime) {
                                    latestStartTime = revealAt;
                                    activeSetupElementKey = key;
                                }
                            }
                            if (activeSetupElementKey) {
                                sceneName = `SETUP_ELEMENTS: ${activeSetupElementKey} (reveals at ${config.SETUP_ELEMENTS[activeSetupElementKey].revealAt.toFixed(1)})`;
                                if (config.SETUP_ELEMENTS[activeSetupElementKey].hideAt !== null) {
                                    sceneName += ` (hides at ${config.SETUP_ELEMENTS[activeSetupElementKey].hideAt.toFixed(1)})`;
                                }
                            } else {
                                // If no specific setup element is "active" but we are before static/timelapse, find the next one to start
                                let nextSetupElementKey = null;
                                let earliestNextTime = Infinity;
                                for (const key in config.SETUP_ELEMENTS) {
                                    const elConfig = config.SETUP_ELEMENTS[key];
                                    if (elConfig.revealAt > currentTime && elConfig.revealAt < earliestNextTime) {
                                        earliestNextTime = elConfig.revealAt;
                                        nextSetupElementKey = key;
                                    }
                                }
                                if (nextSetupElementKey) {
                                    sceneName = `Approaching SETUP_ELEMENTS: ${nextSetupElementKey} (at ${earliestNextTime.toFixed(1)})`;
                                } else if (currentTime < (config.STATIC_FIRST_DATA_POINT_SCENE ? config.STATIC_FIRST_DATA_POINT_SCENE.startAt : Infinity) && 
                                           currentTime < config.TIMELAPSE_ANIMATION.startAt) {
                                     sceneName = "Between Setup Elements / Before Static Scene";       
                                }
                            }
                        }
                        sceneValElement.textContent = sceneName;
                    }
                }
            }
        });

        // --- Build timeline from SETUP_ELEMENTS --- 
        for (const key in ANIMATION_TIMING_CONFIG.SETUP_ELEMENTS) {
            const config = ANIMATION_TIMING_CONFIG.SETUP_ELEMENTS[key];
            if (config.node && config.revealProps) {
                // Special handling for foregroundImage: reveal moves it DOWN
                if (key === 'foregroundImage') {
                     tl.to(config.node, {
                        ...config.revealProps, // Contains y: IMAGE_SETTINGS.height
                        duration: config.transitionDuration,
                    }, config.revealAt);
                } else {
                    // Standard reveal (from initial GSAP set state to revealProps)
                    tl.to(config.node, {
                        ...config.revealProps, // Contains target y, opacity, ease
                        duration: config.transitionDuration,
                    }, config.revealAt); // Absolute position
                }
            }
            if (config.node && config.hideAt !== null && config.hideProps) {
                // Add hide animation if specified
                 tl.to(config.node, {
                    ...config.hideProps, // Contains target y, opacity, ease
                    duration: config.transitionDuration,
                }, config.hideAt); // Absolute position
            }
        }
        // --- End build timeline from SETUP_ELEMENTS ---

        // --- Setup TIMELAPSE_ANIMATION elements --- 
        // const tlapseConfig = ANIMATION_TIMING_CONFIG.TIMELAPSE_ANIMATION; // Already defined earlier
        // const myDisplayConfig = tlapseConfig.monthYearDisplay; // Already defined earlier

        // --- New Static Scene for First Data Point ---
        const staticSceneConfig = ANIMATION_TIMING_CONFIG.STATIC_FIRST_DATA_POINT_SCENE;
        if (animationData.length > 0) {
            const firstDataPoint = animationData[0];

            // At the start of the static scene, draw the first data point's state
            tl.call(() => {
                console.log("Displaying static first data point scene.");
                drawTemperatureLayers(firstDataPoint);
                updateFrostLine(firstDataPoint);
                // Ensure temperature overlay and frost line are visible
                temperatureOverlayGroup.style("opacity", TEMPERATURE_OVERLAY_INITIAL_OPACITY);
                // updateFrostLine function handles its own opacity based on data.
            }, [], staticSceneConfig.startAt);

            // At the end of the static scene (minus fade out), start fading out temp overlay and frost line
            const staticSceneEnd = staticSceneConfig.startAt + staticSceneConfig.duration;
            const staticFadeStart = staticSceneEnd - staticSceneConfig.fadeOutDuration;

            tl.to(temperatureOverlayGroup.node(), {
                opacity: 0,
                duration: staticSceneConfig.fadeOutDuration,
                ease: "power1.in"
            }, staticFadeStart);

            // Also fade out the dynamic frostLine if it's visible
            // We create a temporary tween for frostLine opacity, as it's normally controlled by updateFrostLine
            tl.to(frostLine.node(), { // Assuming frostLine is the d3 selection of the line
                opacity: 0,
                duration: staticSceneConfig.fadeOutDuration,
                ease: "power1.in"
            }, staticFadeStart);
        }
        // --- End New Static Scene ---

        // Month/Year Display Reveal (for the main timelapse)
        // This will now start at the adjusted TIMELAPSE_ANIMATION.startAt
        const myDisplayConfig = tlapseConfig.monthYearDisplay;
        tl.to(monthYearDisplay.node(), { 
            opacity: 1, 
            duration: myDisplayConfig.revealTransitionDuration 
        }, tlapseConfig.startAt); // Absolute position

        // Make temperature overlay visible at the start of the timelapse animation.
        tl.call(() => { 
            temperatureOverlayGroup.style("opacity", TEMPERATURE_OVERLAY_INITIAL_OPACITY);
        }, [], tlapseConfig.startAt); // Position this call at the start of the timelapse block.

        // --- Integrate Data Loop directly into the main timeline 'tl' --- 
        const placedAnnualMaxLabels = [];    // For label collision detection - will be reset per frame
        const weekOfYearFormat = d3.timeFormat("%U");

        // Ensure we only proceed if there's data beyond the first point for the loop
        const timelapseAnimationData = animationData.slice(1); 

        timelapseAnimationData.forEach((d, index) => {
            // Adjust index for callPosition: index now refers to timelapseAnimationData, 
            // so it's already 0-indexed for the remaining data.
            const callPosition = tlapseConfig.startAt + (index * dataLoopConfig.timelineDurationPerDataPoint);
            tl.call(() => {
                // --- Reset for current frame ---
                placedAnnualMaxLabels.length = 0; // Clear for recalculation each frame

                // Update background image for the current week
                let weekNumber = parseInt(weekOfYearFormat(d.date), 10) + 1; // 1-indexed
                if (weekNumber > 52) weekNumber = 52; // Clamp to 52 if 53rd week occurs
                const imageName = `week-${weekNumber.toString().padStart(2, '0')}.webp`;
                
                monthlyBackgroundImage.attr("src", WEEKLY_FRAMES_BASE_PATH + imageName);

                drawTemperatureLayers(d); 
                updateFrostLine(d);       
                monthYearDisplay.text(dateFormat(d.date));
                
                // Update custom debug display for date and frost depth
                const dateDebugElement = document.getElementById('date-debug-val');
                if (dateDebugElement) {
                    dateDebugElement.textContent = d.originalDateString ? d.originalDateString : (d.date ? d.date.toISOString().split('T')[0] : 'N/A');
                }
                const frostDebugElement = document.getElementById('frost-debug-val');
                if (frostDebugElement) {
                    frostDebugElement.textContent = (d.Zero_Crossing_Depth !== null && d.Zero_Crossing_Depth !== undefined) ? d.Zero_Crossing_Depth.toFixed(2) + 'm' : 'N/A';
                }
                
                // --- Logic for drawing/hiding annual maximum frost lines and labels ---
                const annualMaxLinesParent = d3.select("#annual-max-frost-lines-group");
                const labelsAndLeadersParent = d3.select("#static-lines"); // Corresponds to staticLinesGroup

                const sortedAnnualMaxFrostDepths = [...annualMaxFrostDepths].sort((a, b) => a.maxDepth - b.maxDepth);

                sortedAnnualMaxFrostDepths.forEach((annualMaxItem, leaderIdx) => {
                    const year = annualMaxItem.year;
                    const lineId = `annual-max-line-${year}`;
                    const labelId = `annual-max-label-${year}`;
                    const leaderId = `annual-max-leader-${year}`;

                    let lineElement = annualMaxLinesParent.select(`#${lineId}`);
                    let labelElement = labelsAndLeadersParent.select(`#${labelId}`);
                    let leaderElement = labelsAndLeadersParent.select(`#${leaderId}`);

                    // Condition for this annualMaxItem to be visible at current data point 'd'
                    const shouldBeVisible = d.date >= annualMaxItem.monthData.date;

                    if (shouldBeVisible) {
                        const yFrostActual = getYForDepth(annualMaxItem.maxDepth, IMAGE_SETTINGS.width); // Y of the frost line itself on the right edge
                        const yFrostStartForLine = getYForDepth(annualMaxItem.maxDepth, 0); // Y of the frost line on the left for the main line

                        // 1. Determine the collision-adjusted targetY for the label FOR THIS FRAME
                        let currentTargetY = yFrostActual; // Start with the ideal position (aligns with frost line on right edge)
                        let needsAdjustment = true;
                        let attempts = 0;
                        // `placedAnnualMaxLabels` contains labels processed *earlier in this same frame d* and their Y positions
                        while (needsAdjustment && attempts < placedAnnualMaxLabels.length + 2) {
                            needsAdjustment = false;
                            attempts++;
                            for (const placedLabel of placedAnnualMaxLabels) {
                                const newLabelTop = currentTargetY - (ESTIMATED_LABEL_HEIGHT / 2);
                                const newLabelBottom = currentTargetY + (ESTIMATED_LABEL_HEIGHT / 2);
                                if (newLabelTop < placedLabel.yBottom + VERTICAL_LABEL_PADDING && 
                                    newLabelBottom > placedLabel.yTop - VERTICAL_LABEL_PADDING) {
                                    currentTargetY = placedLabel.yBottom + VERTICAL_LABEL_PADDING + (ESTIMATED_LABEL_HEIGHT / 2);
                                    needsAdjustment = true;
                                    break; 
                                }
                            }
                        }

                        // --- Line Element ---
                        if (lineElement.empty()) {
                            lineElement = annualMaxLinesParent.append("line")
                                .attr("id", lineId)
                                .attr("class", `annual-max-frost-line year-${year}`)
                                .attr("x1", 0).attr("y1", yFrostStartForLine) // Use yFrostStartForLine
                                .attr("x2", IMAGE_SETTINGS.width).attr("y2", yFrostActual) // Use yFrostActual for right edge
                                .attr("stroke", ANNUAL_MAX_FROST_LINE_STYLE.stroke)
                                .attr("stroke-width", ANNUAL_MAX_FROST_LINE_STYLE.strokeWidth)
                                .attr("stroke-dasharray", ANNUAL_MAX_FROST_LINE_STYLE.strokeDasharray)
                                .style("stroke-opacity", 0); // Create hidden
                        }
                        // Ensure line is visible and its Y positions are correct (they are static for a given year)
                        lineElement.style("stroke-opacity", ANNUAL_MAX_FROST_LINE_STYLE.strokeOpacity || 1);

                        // --- Label Element ---
                        if (labelElement.empty()) {
                            labelElement = labelsAndLeadersParent.append("text")
                                .attr("id", labelId)
                                .attr("class", `annual-max-frost-label year-${year}`)
                                .attr("x", IMAGE_SETTINGS.width + 100)
                                // .attr("y", currentTargetY) // Set below after creation
                                .text(`${year}`) 
                                .attr("font-family", '"JetBrains Mono"', "monospace")
                                .attr("font-size", `${LABEL_FONT_SIZE}px`) 
                                .attr("fill", ANNUAL_MAX_FROST_LINE_STYLE.labelFill)  
                                .attr("text-anchor", "start") 
                                .attr("dominant-baseline", "middle")
                                .style("opacity", 0); // Create hidden
                        }
                        labelElement
                            .attr("y", currentTargetY) // Update Y position every frame
                            .style("opacity", 1);

                        // --- Leader Line Element ---
                        const leader_p1x = IMAGE_SETTINGS.width;        
                        const leader_p1y = yFrostActual; // Leader starts at the actual frost line Y
                        const baseHorizontalOffset = 20;
                        const incrementHorizontalOffset = 5; 
                        const leader_p2x = IMAGE_SETTINGS.width + baseHorizontalOffset + (leaderIdx * incrementHorizontalOffset); 
                        const leader_p2y = yFrostActual; // Horizontal segment at frost line Y
                        const leader_p3x = leader_p2x; 
                        const leader_p3y = currentTargetY; // Vertical segment goes to the new label Y
                        const leader_p4x = IMAGE_SETTINGS.width + 98; 
                        const leader_p4y = currentTargetY; // Final segment ends at new label Y
                        const newLeaderPathD = `M ${leader_p1x},${leader_p1y} L ${leader_p2x},${leader_p2y} L ${leader_p3x},${leader_p3y} L ${leader_p4x},${leader_p4y}`;

                        if (leaderElement.empty()) {
                            leaderElement = labelsAndLeadersParent.append("path")
                                .attr("id", leaderId)
                                .attr("class", `annual-max-frost-leader year-${year}`)
                                // .attr("d", newLeaderPathD) // Set below after creation
                                .attr("stroke", ANNUAL_MAX_FROST_LEADER_LINE_STYLE.stroke)
                                .attr("stroke-width", ANNUAL_MAX_FROST_LEADER_LINE_STYLE.strokeWidth)
                                .attr("fill", ANNUAL_MAX_FROST_LEADER_LINE_STYLE.fill)
                                .style("opacity", 0); // Create hidden
                        }
                        leaderElement
                            .attr("d", newLeaderPathD) // Update path every frame
                            .style("opacity", 1);
                        
                        // Update or add to placedAnnualMaxLabels for the current frame 'd'
                        let labelInCollisionList = placedAnnualMaxLabels.find(l => l.year === year);
                        if (labelInCollisionList) {
                            labelInCollisionList.yTop = currentTargetY - (ESTIMATED_LABEL_HEIGHT / 2);
                            labelInCollisionList.yBottom = currentTargetY + (ESTIMATED_LABEL_HEIGHT / 2);
                        } else {
                            placedAnnualMaxLabels.push({
                                year: year,
                                yTop: currentTargetY - (ESTIMATED_LABEL_HEIGHT / 2),
                                yBottom: currentTargetY + (ESTIMATED_LABEL_HEIGHT / 2)
                            });
                        }
                        placedAnnualMaxLabels.sort((a,b) => a.yTop - b.yTop);

                    } else { // Should NOT be visible
                        if (!lineElement.empty()) lineElement.style("stroke-opacity", 0);
                        if (!labelElement.empty()) labelElement.style("opacity", 0);
                        if (!leaderElement.empty()) leaderElement.style("opacity", 0);
                        
                        // Remove from placedAnnualMaxLabels for THIS FRAME 'd' if it was there
                        const indexInCollisionList = placedAnnualMaxLabels.findIndex(l => l.year === year);
                        if (indexInCollisionList > -1) {
                            placedAnnualMaxLabels.splice(indexInCollisionList, 1);
                        }
                    }
                });
            }, [], callPosition);
        });
        // --- End Integrate Data Loop --- 

        console.log("Actual tl.duration() after all calls:", tl.duration());

    }).catch(error => {
        console.error("Error loading or parsing CSV data:", error);
    });

    console.log("Initial setup (after path load attempt) complete. Waiting for CSV data and GSAP.");
}); 
